package com.poopornot.wheretopoop.network

import com.poopornot.wheretopoop.BuildConfig
import com.poopornot.wheretopoop.model.MetroResponse
import com.poopornot.wheretopoop.model.PlacesResponse
import com.poopornot.wheretopoop.model.ReverseLocationResponse
import com.poopornot.wheretopoop.model.RouteResponse
import com.poopornot.wheretopoop.model.ToiletsResponse
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.GET
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

interface ApiService {
    @GET("api/places")
    suspend fun searchPlaces(
        @Query("city") city: String,
        @Query("keywords") keywords: String,
        @Query("mode") mode: String = "",
        @Query("limit") limit: Int = 10,
    ): PlacesResponse

    @GET("api/location/reverse")
    suspend fun reverseLocation(
        @Query("lng") longitude: Double,
        @Query("lat") latitude: Double,
    ): ReverseLocationResponse

    @GET("api/toilets")
    suspend fun searchToilets(
        @Query("lng") longitude: Double,
        @Query("lat") latitude: Double,
        @Query("radius") radius: Int,
        @Query("keywords") keywords: String = "公共厕所",
        @Query("limit") limit: Int = 100,
    ): ToiletsResponse

    @GET("api/navigation")
    suspend fun walkingRoute(
        @Query("origin") origin: String,
        @Query("destination") destination: String,
    ): RouteResponse

    @GET("api/metro/nearby")
    suspend fun nearbyMetro(
        @Query("lng") longitude: Double,
        @Query("lat") latitude: Double,
        @Query("radius") radius: Int = 20_000,
        @Query("debugCity") city: String = "",
    ): MetroResponse
}

object ApiClient {
    val service: ApiService by lazy {
        val logger = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BASIC
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(logger)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(normalizeBaseUrl(BuildConfig.API_BASE_URL))
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    private fun normalizeBaseUrl(value: String): String {
        val trimmed = value.trim()
        return if (trimmed.endsWith('/')) trimmed else "$trimmed/"
    }
}

