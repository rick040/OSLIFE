plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "nl.oslife.widgets"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.oslife.widgets"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // Fixed debug-signing key, checked into the repo (app/debug.keystore) — see
    // android/app/build.gradle.kts for why this matters: without it, each CI
    // runner's auto-generated debug key differs, so Android treats every build
    // as a different app and refuses to update in place, wiping widget settings.
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("debug")
        }
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

    // Reliable, retrying background refresh for the widgets.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // Small, well-tested HTTP client for the widget-* edge function calls.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
