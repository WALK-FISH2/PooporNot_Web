package com.poopornot.wheretopoop.model

data class LngLat(
    val longitude: Double,
    val latitude: Double,
)

data class RawLocation(
    val lng: Double? = null,
    val lat: Double? = null,
)

data class PlacePoi(
    val id: String = "",
    val name: String = "地点",
    val address: String = "",
    val type: String = "地点",
    val longitude: Double = 0.0,
    val latitude: Double = 0.0,
    val location: RawLocation? = null,
) {
    fun point() = LngLat(
        longitude = location?.lng ?: longitude,
        latitude = location?.lat ?: latitude,
    )
}

data class ToiletPoi(
    val id: String = "",
    val name: String = "公共厕所",
    val address: String = "",
    val type: String = "公共厕所",
    val distance: Double = 0.0,
    val longitude: Double = 0.0,
    val latitude: Double = 0.0,
    val location: RawLocation? = null,
) {
    fun point() = LngLat(
        longitude = location?.lng ?: longitude,
        latitude = location?.lat ?: latitude,
    )
}

data class MetroStation(
    val name: String = "地铁站",
    val toilet: Int = 2,
    val longitude: Double = 0.0,
    val latitude: Double = 0.0,
    val lineId: String = "",
    val lineName: String = "附近地铁站",
    val lineColor: String = "#9AA3A0",
    val distance: Double = 0.0,
) {
    fun point() = LngLat(longitude, latitude)
}

data class PlacesResponse(
    val places: List<PlacePoi> = emptyList(),
)

data class ToiletsResponse(
    val pois: List<ToiletPoi> = emptyList(),
    val partial: Boolean = false,
)

data class MetroResponse(
    val city: String = "",
    val hasMetro: Boolean = false,
    val stations: List<MetroStation> = emptyList(),
)

data class ReverseLocationResponse(
    val province: String = "",
    val city: String = "",
)

data class RouteResponse(
    val distance: Double = 0.0,
    val duration: Double = 0.0,
    val points: List<LngLat> = emptyList(),
)

enum class ResultKind {
    PLACE,
    TOILET,
    METRO,
}

data class ResultRow(
    val kind: ResultKind,
    val title: String,
    val subtitle: String,
    val meta: String,
    val point: LngLat,
    val source: Any,
    val toiletStatus: Int? = null,
)

data class DetailSelection(
    val kind: ResultKind,
    val title: String,
    val subtitle: String,
    val meta: String,
    val point: LngLat,
    val source: Any,
)

