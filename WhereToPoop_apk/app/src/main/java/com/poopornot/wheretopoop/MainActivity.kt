package com.poopornot.wheretopoop

import android.Manifest
import android.app.Dialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.widget.ArrayAdapter
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.view.setPadding
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.amap.api.location.AMapLocationClient
import com.amap.api.location.AMapLocationClientOption
import com.amap.api.maps.AMap
import com.amap.api.maps.CameraUpdateFactory
import com.amap.api.maps.model.BitmapDescriptorFactory
import com.amap.api.maps.model.LatLng
import com.amap.api.maps.model.Marker
import com.amap.api.maps.model.MarkerOptions
import com.amap.api.maps.model.Polyline
import com.amap.api.maps.model.PolylineOptions
import com.poopornot.wheretopoop.data.CityData
import com.poopornot.wheretopoop.databinding.ActivityMainBinding
import com.poopornot.wheretopoop.databinding.DialogCityBinding
import com.poopornot.wheretopoop.model.DetailSelection
import com.poopornot.wheretopoop.model.LngLat
import com.poopornot.wheretopoop.model.MetroStation
import com.poopornot.wheretopoop.model.PlacePoi
import com.poopornot.wheretopoop.model.ResultKind
import com.poopornot.wheretopoop.model.ResultRow
import com.poopornot.wheretopoop.model.ToiletPoi
import com.poopornot.wheretopoop.network.ApiClient
import com.poopornot.wheretopoop.ui.CityAdapter
import com.poopornot.wheretopoop.ui.ResultAdapter
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.net.SocketTimeoutException
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

class MainActivity : AppCompatActivity(), AMap.OnMarkerClickListener {
    private lateinit var binding: ActivityMainBinding
    private lateinit var map: AMap
    private lateinit var locationClient: AMapLocationClient
    private lateinit var resultAdapter: ResultAdapter

    private val api = ApiClient.service
    private val mapMarkers = mutableListOf<Marker>()
    private var routePolyline: Polyline? = null

    private var userLocation: LngLat? = null
    private var baseLocation: LngLat? = null
    private var baseName = "当前位置"
    private var selectedCity = ""
    private var radius = 500

    private var places = emptyList<PlacePoi>()
    private var toilets = emptyList<ToiletPoi>()
    private var metroStations = emptyList<MetroStation>()
    private var visibleRows = emptyList<ResultRow>()
    private var selectedDetail: DetailSelection? = null

    private val locationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { permissions ->
        val granted = permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            permissions[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (granted) {
            locateUser()
        } else {
            setStatus("请选择城市")
            showEmpty("没有定位权限，请先选择城市和地点。", "请选择城市")
            showCityDialog()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        applySavedTheme()
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.mapView.onCreate(savedInstanceState)
        configureMap()
        configureResults()
        configureControls()
        configureLocationClient()
        if (!warnIfMapKeyMissing()) {
            requestLocationOrExplain()
        }
    }

    private fun configureMap() {
        map = binding.mapView.map
        map.uiSettings.apply {
            isZoomControlsEnabled = false
            isCompassEnabled = true
            isScaleControlsEnabled = true
            isMyLocationButtonEnabled = false
        }
        map.setOnMarkerClickListener(this)
        map.mapType = if (isNightMode()) AMap.MAP_TYPE_NIGHT else AMap.MAP_TYPE_NORMAL
        map.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(31.49117, 120.31191), 12f))
    }

    private fun configureResults() {
        resultAdapter = ResultAdapter(
            onSelect = ::selectRow,
            onPrimary = { row ->
                if (row.kind == ResultKind.PLACE) selectRow(row) else routeTo(row)
            },
            onNavigate = ::openSystemNavigation,
        )
        binding.resultList.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = resultAdapter
        }
    }

    private fun configureControls() {
        val radii = listOf("半径 300 m", "半径 500 m", "半径 1 km", "半径 3 km")
        binding.radiusSpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            radii,
        )
        binding.radiusSpinner.setSelection(1)
        binding.radiusSpinner.onItemSelectedListener = SimpleItemSelectedListener { position ->
            radius = listOf(300, 500, 1000, 3000)[position.coerceIn(0, 3)]
        }

        binding.cityButton.setOnClickListener { showCityDialog() }
        binding.placeSearchButton.setOnClickListener { searchPlaceCandidates() }
        binding.toiletSearchButton.setOnClickListener { searchToilets() }
        binding.locateButton.setOnClickListener { requestLocationOrExplain() }
        binding.metroButton.setOnClickListener { showNearestMetro() }
        binding.themeButton.setOnClickListener { toggleTheme() }
        binding.placeInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                searchPlaceCandidates()
                true
            } else {
                false
            }
        }
    }

    private fun configureLocationClient() {
        locationClient = AMapLocationClient(applicationContext)
        locationClient.setLocationOption(
            AMapLocationClientOption().apply {
                locationMode = AMapLocationClientOption.AMapLocationMode.Hight_Accuracy
                isOnceLocation = true
                isOnceLocationLatest = true
                isNeedAddress = false
                httpTimeOut = 15_000
            },
        )
        locationClient.setLocationListener { location ->
            locationClient.stopLocation()
            if (location == null || location.errorCode != 0) {
                val detail = location?.errorInfo?.takeIf { it.isNotBlank() } ?: "定位服务没有返回位置"
                showError("定位失败：$detail")
                if (baseLocation == null) showCityDialog()
                return@setLocationListener
            }

            val point = LngLat(location.longitude, location.latitude)
            userLocation = point
            baseLocation = point
            baseName = "当前位置"
            moveCamera(point, 15f)
            setStatus("已定位")
            lifecycleScope.launch {
                reverseCity(point)
                loadMetro(point)
                searchToilets(point)
            }
        }
    }

    private fun requestLocationOrExplain() {
        if (hasLocationPermission()) {
            locateUser()
            return
        }

        if (shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) {
            AlertDialog.Builder(this)
                .setTitle("需要位置权限")
                .setMessage(getString(R.string.location_permission_reason))
                .setPositiveButton("继续") { _, _ -> launchLocationPermission() }
                .setNegativeButton("选择城市") { _, _ -> showCityDialog() }
                .show()
        } else {
            launchLocationPermission()
        }
    }

    private fun launchLocationPermission() {
        locationPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        )
    }

    private fun locateUser() {
        if (!hasLocationPermission()) return
        setStatus("定位中")
        locationClient.stopLocation()
        locationClient.startLocation()
    }

    private suspend fun reverseCity(point: LngLat) {
        runCatching { api.reverseLocation(point.longitude, point.latitude) }
            .onSuccess { result ->
                selectedCity = result.city
                updateCityButton()
            }
    }

    private fun useCity(city: String) {
        selectedCity = city
        updateCityButton()
        setStatus("切换城市")
        lifecycleScope.launch {
            runApi {
                val cityPlace = api.searchPlaces(city, city, mode = "city").places.firstOrNull()
                    ?: error("没有找到这个城市")
                val point = cityPlace.point()
                baseLocation = point
                baseName = city
                places = emptyList()
                toilets = emptyList()
                selectedDetail = null
                clearRoute()
                moveCamera(point, 12f)
                showEmpty("可输入小区、商场、地铁站或地址作为查找基准点。", "$city 地图")
                setStatus("已切换")
                loadMetro(point)
                refreshMarkers()
            }
        }
    }

    private fun searchPlaceCandidates() {
        val city = selectedCity.trim()
        val keyword = binding.placeInput.text?.toString()?.trim().orEmpty()
        if (city.isBlank()) {
            showMessage("请先选择城市")
            showCityDialog()
            return
        }
        if (keyword.isBlank()) {
            showMessage("请输入小区、商场、地铁站或地址")
            return
        }

        setStatus("找地点")
        lifecycleScope.launch {
            runApi {
                places = api.searchPlaces(city, keyword).places
                toilets = emptyList()
                clearRoute()
                val rows = places.map { place ->
                    ResultRow(
                        kind = ResultKind.PLACE,
                        title = place.name,
                        subtitle = place.address,
                        meta = place.type.ifBlank { "地点" },
                        point = place.point(),
                        source = place,
                    )
                }
                showRows(rows, keyword)
                setStatus("请选择地点")
                refreshMarkers()
                fitVisiblePoints(rows.map(ResultRow::point))
            }
        }
    }

    private fun searchToilets(point: LngLat? = baseLocation) {
        val center = point
        if (center == null) {
            showMessage("请先选择城市或地点")
            return
        }

        setStatus("搜索厕所")
        lifecycleScope.launch {
            runApi {
                val response = api.searchToilets(center.longitude, center.latitude, radius)
                toilets = response.pois
                places = emptyList()
                clearRoute()
                val rows = toilets.map { toilet ->
                    ResultRow(
                        kind = ResultKind.TOILET,
                        title = toilet.name,
                        subtitle = toilet.address,
                        meta = formatDistance(toilet.distance),
                        point = toilet.point(),
                        source = toilet,
                    )
                }
                showRows(rows, "$baseName · ${formatDistance(radius.toDouble())} 内")
                setStatus(if (response.partial) "部分结果" else "已更新")
                refreshMarkers()
                fitVisiblePoints(rows.map(ResultRow::point))
            }
        }
    }

    private suspend fun loadMetro(point: LngLat) {
        runCatching {
            api.nearbyMetro(point.longitude, point.latitude, city = selectedCity)
        }.onSuccess { result ->
            if (selectedCity.isBlank() && result.city.isNotBlank()) {
                selectedCity = result.city
                updateCityButton()
            }
            metroStations = result.stations.sortedBy { station ->
                distanceMeters(point, station.point())
            }
            refreshMarkers()
        }
    }

    private fun showNearestMetro() {
        val center = baseLocation ?: userLocation
        if (center == null) {
            showMessage("请先定位或选择地点")
            return
        }

        val rows = metroStations
            .sortedBy { distanceMeters(center, it.point()) }
            .take(10)
            .map { station ->
                val distance = distanceMeters(center, station.point())
                ResultRow(
                    kind = ResultKind.METRO,
                    title = station.name,
                    subtitle = station.lineName,
                    meta = "${toiletText(station.toilet)} · ${formatDistance(distance)}",
                    point = station.point(),
                    source = station,
                    toiletStatus = station.toilet,
                )
            }
        showRows(
            rows,
            if (rows.isEmpty()) "${selectedCity.ifBlank { "当前城市" }}暂无地铁厕所数据" else "最近地铁站",
        )
        setStatus("地铁站")
        refreshMarkers()
    }

    private fun selectRow(row: ResultRow) {
        val detail = DetailSelection(
            kind = row.kind,
            title = row.title,
            subtitle = row.subtitle.ifBlank { "暂无地址" },
            meta = row.meta,
            point = row.point,
            source = row.source,
        )
        selectedDetail = detail
        clearRoute()
        moveCamera(row.point, 17f)

        if (row.kind == ResultKind.PLACE) {
            baseLocation = row.point
            baseName = row.title
            lifecycleScope.launch { loadMetro(row.point) }
        }
        showDetail(detail)
    }

    private fun showDetail(detail: DetailSelection) {
        binding.resultList.visibility = View.GONE
        binding.emptyView.visibility = View.GONE
        binding.detailPanel.visibility = View.VISIBLE
        binding.resultTitle.text = detail.title
        binding.resultCount.text = when (detail.kind) {
            ResultKind.PLACE -> "点"
            ResultKind.TOILET -> detail.meta
            ResultKind.METRO -> (detail.source as MetroStation).let { toiletShortText(it.toilet) }
        }
        binding.detailTitle.text = detail.title
        binding.detailSubtitle.text = detail.subtitle
        binding.detailMeta.text = when (detail.kind) {
            ResultKind.METRO -> toiletText((detail.source as MetroStation).toilet)
            else -> detail.meta
        }
        binding.detailPrimaryButton.text = if (detail.kind == ResultKind.PLACE) "查找周围厕所" else "路线"
        binding.detailNavigateButton.visibility = if (detail.kind == ResultKind.PLACE) View.GONE else View.VISIBLE
        binding.detailPrimaryButton.visibility = View.VISIBLE
        binding.detailBackButton.visibility = View.VISIBLE
        binding.detailPrimaryButton.setOnClickListener {
            if (detail.kind == ResultKind.PLACE) searchToilets(detail.point) else routeTo(detail)
        }
        binding.detailNavigateButton.setOnClickListener { openSystemNavigation(detail) }
        binding.detailBackButton.setOnClickListener {
            clearRoute()
            showRows(visibleRows, previousListTitle())
            refreshMarkers()
        }
    }

    private fun routeTo(row: ResultRow) {
        routeTo(
            DetailSelection(
                row.kind,
                row.title,
                row.subtitle,
                row.meta,
                row.point,
                row.source,
            ),
        )
    }

    private fun routeTo(detail: DetailSelection) {
        val origin = baseLocation ?: userLocation
        if (origin == null) {
            showMessage("没有可用的出发位置")
            return
        }

        selectedDetail = detail
        setStatus("规划路线")
        lifecycleScope.launch {
            runApi {
                val route = api.walkingRoute(
                    origin = "${origin.longitude},${origin.latitude}",
                    destination = "${detail.point.longitude},${detail.point.latitude}",
                )
                drawRoute(route.points)
                showRouteSummary(detail, route.distance, route.duration)
                setStatus("路线已生成")
            }
        }
    }

    private fun showRouteSummary(detail: DetailSelection, distance: Double, duration: Double) {
        binding.resultList.visibility = View.GONE
        binding.emptyView.visibility = View.GONE
        binding.detailPanel.visibility = View.VISIBLE
        binding.resultTitle.text = detail.title
        binding.resultCount.text = formatDuration(duration)
        binding.detailTitle.text = detail.title
        binding.detailSubtitle.text = detail.subtitle
        binding.detailMeta.text = "${formatDistance(distance)} · ${formatDuration(duration)}"
        binding.detailPrimaryButton.visibility = View.GONE
        binding.detailNavigateButton.visibility = View.VISIBLE
        binding.detailNavigateButton.setOnClickListener { openSystemNavigation(detail) }
        binding.detailBackButton.visibility = View.VISIBLE
        binding.detailBackButton.setOnClickListener {
            clearRoute()
            showDetail(detail)
        }
    }

    private fun showRows(rows: List<ResultRow>, title: String) {
        visibleRows = rows
        binding.resultTitle.text = title
        binding.resultCount.text = rows.size.toString()
        binding.detailPanel.visibility = View.GONE
        binding.resultList.visibility = if (rows.isEmpty()) View.GONE else View.VISIBLE
        binding.emptyView.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
        binding.emptyView.text = if (rows.isEmpty()) "暂无结果" else ""
        resultAdapter.submitList(rows)
    }

    private fun showEmpty(message: String, title: String = "等待选择") {
        visibleRows = emptyList()
        binding.resultTitle.text = title
        binding.resultCount.text = "0"
        binding.detailPanel.visibility = View.GONE
        binding.resultList.visibility = View.GONE
        binding.emptyView.visibility = View.VISIBLE
        binding.emptyView.text = message
        resultAdapter.submitList(emptyList())
    }

    private fun refreshMarkers() {
        mapMarkers.forEach(Marker::remove)
        mapMarkers.clear()

        metroStations.forEach { station ->
            val row = ResultRow(
                ResultKind.METRO,
                station.name,
                station.lineName,
                toiletText(station.toilet),
                station.point(),
                station,
                station.toilet,
            )
            addMarker(
                row,
                iconResource = when (station.toilet) {
                    1 -> R.drawable.metro_green
                    0 -> R.drawable.metro_red
                    else -> R.drawable.metro_gray
                },
                anchorY = 0.5f,
            )
        }

        places.forEach { place ->
            addMarker(
                ResultRow(
                    ResultKind.PLACE,
                    place.name,
                    place.address,
                    place.type,
                    place.point(),
                    place,
                ),
                hue = BitmapDescriptorFactory.HUE_AZURE,
                anchorY = 1f,
            )
        }

        toilets.forEach { toilet ->
            addMarker(
                ResultRow(
                    ResultKind.TOILET,
                    toilet.name,
                    toilet.address,
                    formatDistance(toilet.distance),
                    toilet.point(),
                    toilet,
                ),
                iconResource = R.drawable.marker_toilet,
                anchorY = 0.5f,
            )
        }

        baseLocation?.let { point ->
            val marker = map.addMarker(
                MarkerOptions()
                    .position(point.toLatLng())
                    .title(baseName)
                    .snippet("查找基准点")
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_BLUE))
                    .zIndex(200f),
            )
            marker?.let(mapMarkers::add)
        }

        userLocation?.takeIf { it != baseLocation }?.let { point ->
            val marker = map.addMarker(
                MarkerOptions()
                    .position(point.toLatLng())
                    .title("我的位置")
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_CYAN))
                    .zIndex(210f),
            )
            marker?.let(mapMarkers::add)
        }
    }

    private fun addMarker(
        row: ResultRow,
        iconResource: Int? = null,
        hue: Float = BitmapDescriptorFactory.HUE_RED,
        anchorY: Float,
    ) {
        val icon = iconResource?.let(BitmapDescriptorFactory::fromResource)
            ?: BitmapDescriptorFactory.defaultMarker(hue)
        val marker = map.addMarker(
            MarkerOptions()
                .position(row.point.toLatLng())
                .title(row.title)
                .snippet(row.meta)
                .icon(icon)
                .zIndex(if (row.kind == ResultKind.METRO) 120f else 100f),
        ) ?: return
        marker.`object` = row
        marker.setAnchor(0.5f, anchorY)
        mapMarkers += marker
    }

    override fun onMarkerClick(marker: Marker): Boolean {
        val row = marker.`object` as? ResultRow ?: return false
        selectRow(row)
        return true
    }

    private fun drawRoute(points: List<LngLat>) {
        clearRoute()
        if (points.isEmpty()) return
        routePolyline = map.addPolyline(
            PolylineOptions()
                .addAll(points.map(LngLat::toLatLng))
                .color(Color.argb(230, 35, 116, 171))
                .width(14f)
                .zIndex(80f),
        )
        fitVisiblePoints(points)
    }

    private fun clearRoute() {
        routePolyline?.remove()
        routePolyline = null
    }

    private fun moveCamera(point: LngLat, zoom: Float) {
        map.animateCamera(CameraUpdateFactory.newLatLngZoom(point.toLatLng(), zoom))
    }

    private fun fitVisiblePoints(points: List<LngLat>) {
        if (points.isEmpty()) return
        if (points.size == 1) {
            moveCamera(points.first(), 16f)
            return
        }
        val bounds = com.amap.api.maps.model.LatLngBounds.builder().apply {
            points.forEach { include(it.toLatLng()) }
            baseLocation?.let { include(it.toLatLng()) }
        }.build()
        map.animateCamera(CameraUpdateFactory.newLatLngBounds(bounds, 80))
    }

    private fun showCityDialog() {
        val dialog = Dialog(this)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val cityBinding = DialogCityBinding.inflate(layoutInflater)
        dialog.setContentView(cityBinding.root)

        val cityAdapter = CityAdapter { city ->
            dialog.dismiss()
            useCity(city)
        }
        cityBinding.cityList.layoutManager = LinearLayoutManager(this)
        cityBinding.cityList.adapter = cityAdapter
        cityAdapter.submitList(CityData.groups.getValue("A"))
        cityBinding.closeButton.setOnClickListener { dialog.dismiss() }

        CityData.recommended.forEach { city ->
            cityBinding.recommendedContainer.addView(
                createChip(city) {
                    dialog.dismiss()
                    useCity(city)
                },
            )
        }
        CityData.groups.keys.forEach { letter ->
            cityBinding.letterContainer.addView(
                createChip(letter) {
                    cityBinding.activeLetterText.text = letter
                    cityAdapter.submitList(CityData.groups.getValue(letter))
                    cityBinding.cityList.scrollToPosition(0)
                },
            )
        }

        dialog.setOnShowListener {
            dialog.window?.apply {
                setBackgroundDrawableResource(android.R.color.transparent)
                setLayout(WindowManager.LayoutParams.MATCH_PARENT, (resources.displayMetrics.heightPixels * 0.86).roundToInt())
                setGravity(Gravity.BOTTOM)
            }
        }
        dialog.show()
    }

    private fun createChip(text: String, onClick: () -> Unit): TextView {
        return TextView(this).apply {
            this.text = text
            gravity = Gravity.CENTER
            setTextColor(ContextCompat.getColor(this@MainActivity, R.color.text_primary))
            textSize = 14f
            minWidth = dp(48)
            setPadding(dp(12))
            background = GradientDrawable().apply {
                cornerRadius = dp(6).toFloat()
                setColor(ContextCompat.getColor(this@MainActivity, R.color.surface_muted))
            }
            layoutParams = android.widget.LinearLayout.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                dp(36),
            ).apply {
                marginEnd = dp(8)
            }
            setOnClickListener { onClick() }
        }
    }

    private fun openSystemNavigation(row: ResultRow) {
        openSystemNavigation(
            DetailSelection(row.kind, row.title, row.subtitle, row.meta, row.point, row.source),
        )
    }

    private fun openSystemNavigation(detail: DetailSelection) {
        val name = Uri.encode(detail.title)
        val amapUri = Uri.parse(
            "androidamap://route?sourceApplication=${Uri.encode(getString(R.string.app_name))}" +
                "&dlat=${detail.point.latitude}&dlon=${detail.point.longitude}" +
                "&dname=$name&dev=0&t=2",
        )
        try {
            startActivity(
                Intent(Intent.ACTION_VIEW, amapUri).setPackage("com.autonavi.minimap"),
            )
        } catch (_: ActivityNotFoundException) {
            val geoUri = Uri.parse(
                "geo:${detail.point.latitude},${detail.point.longitude}" +
                    "?q=${detail.point.latitude},${detail.point.longitude}(${Uri.encode(detail.title)})",
            )
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, geoUri)) }
                .onFailure { showMessage("没有找到可用的地图应用") }
        }
    }

    private fun toggleTheme() {
        val next = if (isNightMode()) AppCompatDelegate.MODE_NIGHT_NO else AppCompatDelegate.MODE_NIGHT_YES
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_THEME, next).apply()
        AppCompatDelegate.setDefaultNightMode(next)
    }

    private fun applySavedTheme() {
        val saved = getSharedPreferences(PREFS, MODE_PRIVATE)
            .getInt(KEY_THEME, AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        AppCompatDelegate.setDefaultNightMode(saved)
    }

    private fun isNightMode(): Boolean {
        return resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
            Configuration.UI_MODE_NIGHT_YES
    }

    private fun updateCityButton() {
        binding.cityButton.text = "${selectedCity.ifBlank { "城市" }} ▾"
    }

    private fun warnIfMapKeyMissing(): Boolean {
        if (BuildConfig.AMAP_ANDROID_KEY.isNotBlank()) return false
        AlertDialog.Builder(this)
            .setTitle("缺少高德 Android Key")
            .setMessage("请在 local.properties 中配置 AMAP_ANDROID_KEY，否则地图和定位无法正常显示。")
            .setPositiveButton("继续") { _, _ -> requestLocationOrExplain() }
            .show()
        return true
    }

    private fun previousListTitle(): String {
        return when (visibleRows.firstOrNull()?.kind) {
            ResultKind.PLACE -> binding.placeInput.text?.toString()?.trim().orEmpty().ifBlank { "地点候选" }
            ResultKind.TOILET -> "$baseName · ${formatDistance(radius.toDouble())} 内"
            ResultKind.METRO -> "最近地铁站"
            null -> "等待选择"
        }
    }

    private fun setStatus(text: String) {
        binding.statusText.text = text
    }

    private fun showError(error: Throwable) {
        val message = when (error) {
            is HttpException -> "请求失败 ${error.code()}"
            is SocketTimeoutException -> "请求超时，请检查网络"
            else -> error.message ?: "操作失败"
        }
        setStatus(message)
        showMessage(message)
    }

    private fun showError(message: String) {
        setStatus(message)
        showMessage(message)
    }

    private suspend fun runApi(block: suspend () -> Unit) {
        try {
            block()
        } catch (error: Throwable) {
            showError(error)
        }
    }

    private fun showMessage(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun hasLocationPermission(): Boolean {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun toiletText(status: Int): String {
        return when (status) {
            1 -> "有厕所"
            0 -> "无厕所"
            else -> "厕所情况不确定"
        }
    }

    private fun toiletShortText(status: Int): String {
        return when (status) {
            1 -> "有"
            0 -> "无"
            else -> "未知"
        }
    }

    private fun formatDistance(distance: Double): String {
        return if (distance >= 1000) {
            "%.1f km".format(distance / 1000)
        } else {
            "${distance.roundToInt()} m"
        }
    }

    private fun formatDuration(seconds: Double): String {
        return "${maxOf(1, (seconds / 60).roundToInt())} 分钟"
    }

    private fun distanceMeters(from: LngLat, to: LngLat): Double {
        val rad = Math.PI / 180
        val earthRadius = 6_371_000.0
        val lat1 = from.latitude * rad
        val lat2 = to.latitude * rad
        val deltaLat = (to.latitude - from.latitude) * rad
        val deltaLng = (to.longitude - from.longitude) * rad
        val a = sin(deltaLat / 2) * sin(deltaLat / 2) +
            cos(lat1) * cos(lat2) * sin(deltaLng / 2) * sin(deltaLng / 2)
        return earthRadius * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    private fun LngLat.toLatLng() = LatLng(latitude, longitude)

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

    override fun onResume() {
        super.onResume()
        binding.mapView.onResume()
    }

    override fun onPause() {
        binding.mapView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        binding.mapView.onSaveInstanceState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        locationClient.onDestroy()
        binding.mapView.onDestroy()
        super.onDestroy()
    }

    companion object {
        private const val PREFS = "where_to_poop"
        private const val KEY_THEME = "theme"
    }
}
