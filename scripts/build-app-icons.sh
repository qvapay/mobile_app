#!/bin/bash
# Genera el arte de los iconos alternativos de la app (feature GOLD "Ícono de la app").
#
# Produce, por cada variante del catálogo (ver VARIANTS abajo):
#   - iOS: Images.xcassets/AppIcon<Name>.appiconset/ (single-size 1024 + Contents.json)
#   - Android adaptativo: foregrounds tintados por densidad (solo variantes con tinte;
#     el resto reutiliza @mipmap/ic_launcher_foreground — los XML adaptativos y los
#     @color de fondo viven en res/ y se editan a mano, no aquí)
#   - Android legacy (API 24/25): mipmap-*/ic_launcher_<id>.png aplanados
#   - Previews in-app: assets/images/icons/icon-preview-<id>.png (216x216)
#
# Idempotente: sobrescribe lo generado. Los PNG resultantes se commitean.
# Requiere ImageMagick 7 (`magick`). El icono por defecto (violeta) no se toca.

set -euo pipefail
cd "$(dirname "$0")/.."

GLYPH="assets/images/ui/qvapay-logo-white.png"
MARKETING="ios/QvaPay/Images.xcassets/AppIcon.appiconset/AppIcon~ios-marketing.png"
XCASSETS="ios/QvaPay/Images.xcassets"
RES="android/app/src/main/res"
PREVIEWS="assets/images/icons"

# id|NombreiOS|fondo|tinte del glifo (vacío = blanco original)
VARIANTS=(
	"midnight|AppIconMidnight|#0E0E1C|"
	"gold|AppIconGold|#E6A817|"
	"ocean|AppIconOcean|#2F80ED|"
	"pink|AppIconPink|#E84393|"
	"navidad|AppIconNavidad|#C6303E|"
	"halloween|AppIconHalloween|#2A1B3D|#FF8A00"
	"blackfriday|AppIconBlackFriday|#000000|#E6A817"
)

# Densidades Android: carpeta|tamaño legacy|tamaño foreground adaptativo
DENSITIES=(
	"mipmap-mdpi|48|108"
	"mipmap-hdpi|72|162"
	"mipmap-xhdpi|96|216"
	"mipmap-xxhdpi|144|324"
	"mipmap-xxxhdpi|192|432"
)

# Tinta un glifo blanco preservando alpha y sombras (multiplica RGB contra el color)
tint() { # src color out
	magick "$1" \( -clone 0 -fill "$2" -colorize 100 \) \
		-channel RGB -compose multiply -composite +channel "$3"
}

mkdir -p "$PREVIEWS"

for entry in "${VARIANTS[@]}"; do
	IFS='|' read -r id ios_name bg tint_color <<< "$entry"
	echo "==> $id (bg $bg${tint_color:+, glifo $tint_color})"

	# Glifo de trabajo a 1024 (tintado si aplica)
	work_glyph="$(mktemp -t "qpicon-$id").png"
	if [ -n "$tint_color" ]; then
		tint "$GLYPH" "$tint_color" "$work_glyph"
	else
		cp "$GLYPH" "$work_glyph"
	fi

	# --- iOS: appiconset single-size 1024 ---
	iconset="$XCASSETS/$ios_name.appiconset"
	mkdir -p "$iconset"
	magick -size 1024x1024 "xc:$bg" \
		\( "$work_glyph" -resize 640x640 \) -gravity center -composite \
		"$iconset/$ios_name.png"
	cat > "$iconset/Contents.json" <<-EOF
	{
	  "images" : [
	    {
	      "filename" : "$ios_name.png",
	      "idiom" : "universal",
	      "platform" : "ios",
	      "size" : "1024x1024"
	    }
	  ],
	  "info" : {
	    "author" : "xcode",
	    "version" : 1
	  }
	}
	EOF

	# --- Android por densidad ---
	for d in "${DENSITIES[@]}"; do
		IFS='|' read -r dir legacy_size fg_size <<< "$d"

		# Foreground adaptativo tintado (solo variantes con tinte); conserva
		# la sombra suave y el padding de safe-zone del original
		if [ -n "$tint_color" ]; then
			tint "$RES/$dir/ic_launcher_foreground.png" "$tint_color" \
				"$RES/$dir/ic_launcher_foreground_$id.png"
		fi

		# Legacy aplanado: cuadrado redondeado inset (misma silueta que el
		# ic_launcher.png actual) + glifo centrado
		m=$(( legacy_size * 6 / 100 )); r=$(( legacy_size * 15 / 100 ))
		g=$(( legacy_size * 62 / 100 ))
		magick -size "${legacy_size}x${legacy_size}" xc:none -fill "$bg" \
			-draw "roundrectangle $m,$m,$(( legacy_size - 1 - m )),$(( legacy_size - 1 - m )),$r,$r" \
			\( "$work_glyph" -resize "${g}x${g}" \) -gravity center -composite \
			"$RES/$dir/ic_launcher_$id.png"
	done

	# --- Preview in-app ---
	magick "$iconset/$ios_name.png" -resize 216x216 "$PREVIEWS/icon-preview-$id.png"

	rm -f "$work_glyph"
done

# Preview del icono por defecto, desde el arte real de la app
magick "$MARKETING" -resize 216x216 "$PREVIEWS/icon-preview-default.png"

echo "Listo. Revisa visualmente $PREVIEWS y los appiconsets generados."
