plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// CI passes GITHUB_RUN_NUMBER, so every build gets a higher versionCode and
// installs over the previous one. Local builds fall back to 1.
val buildNumber = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1

android {
    namespace = "nl.oslife.gym"
    compileSdk = 34

    defaultConfig {
        applicationId = "nl.oslife.gym"
        minSdk = 26
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"
    }

    // Same fixed debug key as /android and /android-widgets: without it every CI
    // runner signs with a different key and Android refuses to update in place.
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
}

// No libraries on purpose: plain Android framework only, so there is little to
// break or update on a device that should just run for years.
dependencies {
}
