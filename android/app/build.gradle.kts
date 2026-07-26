plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "nl.oslife.walktracker"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.oslife.walktracker"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")

    // Location + activity/geofence detection — Google Play services, free.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // Reliable, retrying background upload of the finished walk.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Small, well-tested HTTP client for the one POST/GET per walk-ingest call.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // In-app route map — free OpenStreetMap tiles, no Google Maps API key/billing,
    // matches the web dashboard's Leaflet/OSM map card.
    implementation("org.osmdroid:osmdroid-android:6.1.20")
}
