# Wra1th EQ ProGuard/R8 rules.

# kotlinx.serialization: keep generated serializers for persisted models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.wra1th.eq.**$$serializer { *; }
-keepclassmembers class com.wra1th.eq.** { *** Companion; }
-keepclasseswithmembers class com.wra1th.eq.** { kotlinx.serialization.KSerializer serializer(...); }
