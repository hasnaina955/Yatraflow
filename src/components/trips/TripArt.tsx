// ============ My trips — papercut art ============
// Region motifs and the banner panorama as one inline SVG sprite. The art is
// flat silhouettes in currentColor, so each region only sets a sky gradient and
// an ink colour in CSS. There are no photos. A trip with no cover image of its
// own gets the motif that regionFor() picks from its destinations.
import type { TripRegion } from '../../lib/tripsPage'

/** Mount once per page. Cards and the banner reference the symbols by id. */
export function TripArtSprite() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: 'absolute' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <g id="mt-palm-shape" fill="currentColor">
          <path d="M262 146C258 116 262 92 276 70" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"/>
          <path d="M276 70c-14-12-34-12-46 0 16-4 30-2 46 0z"/>
          <path d="M276 70c-6-18-22-26-38-24 14 6 26 14 38 24z"/>
          <path d="M276 70c4-18 20-26 36-22-14 4-26 12-36 22z"/>
          <path d="M276 70c14-10 34-8 44 6-16-6-30-6-44-6z"/>
          <path d="M276 70c-2 14-12 26-24 32 10-10 18-20 24-32z"/>
          <path d="M276 70c8 12 12 26 8 38-2-14-4-26-8-38z"/>
        </g>
        <symbol id="mt-m-coorg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="238" cy="52" r="18" fill="#FFF6DD" opacity=".9"/>
          <path d="M0 108c46-26 92-32 140-14s96 8 180-20v126H0z" fill="currentColor" opacity=".24"/>
          <path d="M0 136c52-26 104-30 154-10s100 14 166-6v80H0z" fill="currentColor" opacity=".45"/>
          <g fill="none" stroke="#fff" strokeWidth="1.4" opacity=".3" strokeLinecap="round">
            <path d="M22 134c40-14 82-16 126-4M18 144c46-14 94-14 140-2M60 124c30-8 62-6 92 4"/>
            <path d="M190 126c32 4 66 0 100-8M180 136c36 6 74 2 112-8"/>
          </g>
          <g fill="currentColor" opacity=".9">
            <rect x="64" y="104" width="3" height="32"/><ellipse cx="65.5" cy="100" rx="17" ry="9"/><ellipse cx="53" cy="106" rx="11" ry="6"/><ellipse cx="78" cy="106" rx="11" ry="6"/>
            <rect x="236" y="96" width="3" height="34"/><ellipse cx="237.5" cy="92" rx="19" ry="10"/><ellipse cx="224" cy="99" rx="11" ry="6"/><ellipse cx="251" cy="99" rx="12" ry="6"/>
            <rect x="150" y="116" width="2.4" height="22"/><ellipse cx="151.2" cy="113" rx="12" ry="6.5"/>
          </g>
          <path d="M118 200c16-18 30-26 60-34s60-14 80-30" fill="none" stroke="#FFF1D6" strokeWidth="5" strokeLinecap="round" opacity=".6"/>
          <path d="M0 176c60-14 120-6 180-4s100-8 140-4v32H0z" fill="currentColor"/>
          <g fill="currentColor" opacity=".9"><path d="M20 176c4-14 9-14 12 0zM40 176c3-10 7-10 10 0zM284 174c4-14 9-14 12 0z"/></g>
        </symbol>
        <symbol id="mt-m-kashmir" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="252" cy="46" r="15" fill="#FFF6DD" opacity=".9"/>
          <path d="M0 116 34 78l22 20 40-56 38 54 28-22 44 42 30-26 84 50v60H0z" fill="currentColor" opacity=".28"/>
          <path d="M96 42 82 62l8-4 6 9 7-9 9 4zM170 66l-9 11 5-3 4 6 4-6 5 3zM250 66l-9 10 5-2 4 5 4-5 5 2z" fill="#fff" opacity=".9"/>
          <path d="M0 146 50 112l34 22 46-36 54 48 46-26 90 42v38H0z" fill="currentColor" opacity=".5"/>
          <rect y="150" width="320" height="50" fill="currentColor" opacity=".18"/>
          <path d="M40 160h52M120 170h70M222 158h54M60 184h60M180 186h80" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
          <path d="M150 160c18 8 66 8 84 0-4 10-80 10-84 0z" fill="currentColor"/>
          <path d="M176 158 184 146h30l8 12z" fill="currentColor" opacity=".85"/>
          <path d="M186 150h26" stroke="#fff" strokeWidth="1.6" opacity=".5"/>
          <path d="M228 154l12-24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          <g fill="currentColor">
            <path d="M18 176 26 108 34 176z"/><path d="M34 178 40 124 46 178z"/><path d="M6 178 11 134 16 178z"/><path d="M270 176 277 118 284 176z"/><path d="M286 178 291 132 296 178z"/>
          </g>
          <path d="M0 184c70-10 130-4 190-2 56 2 94-6 130-2v20H0z" fill="currentColor"/>
        </symbol>
        <symbol id="mt-m-kerala" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="84" cy="58" r="20" fill="#FFF6DD" opacity=".9"/>
          <path d="M0 124c50-10 96-2 140-6 56-6 110 4 180-4v32H0z" fill="currentColor" opacity=".35"/>
          <rect y="140" width="320" height="60" fill="currentColor" opacity=".16"/>
          <path d="M24 162h44M100 174h64M196 160h52M232 184h56M40 188h40" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".55"/>
          <path d="M114 150c10-22 74-22 84 0z" fill="currentColor" opacity=".72"/>
          <path d="M126 150v-9M142 150v-14M158 150v-16M174 150v-14M190 150v-9" stroke="#fff" strokeWidth="1.5" opacity=".35"/>
          <path d="M104 150h104l-12 12h-80z" fill="currentColor"/>
          <path d="M120 168h72" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".28"/>
          <use href="#mt-palm-shape"/>
          <use href="#mt-palm-shape" transform="translate(-166 36) scale(.75)"/>
          <path d="M0 192c80-6 200-6 320 0v8H0z" fill="currentColor" opacity=".5"/>
        </symbol>
        <symbol id="mt-m-meghalaya" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="82" cy="46" r="16" fill="#FFF6DD" opacity=".75"/>
          <path d="M0 110c40-26 82-22 124-8s90 6 130-14 46-6 66 4v108H0z" fill="currentColor" opacity=".22"/>
          <path d="M0 132c36-18 76-20 112-8 38 12 66 8 98-8s74-10 110 6v78H0z" fill="currentColor" opacity=".42"/>
          <g stroke="#fff" strokeLinecap="round" opacity=".7">
            <path d="M232 94v52" strokeWidth="5"/><path d="M243 98v46" strokeWidth="3"/><path d="M222 100v40" strokeWidth="2.5"/>
          </g>
          <path d="M208 92h46v8h-46z" fill="currentColor" opacity=".55"/>
          <path d="M214 148c10-6 30-6 40 0-8 6-32 6-40 0z" fill="#fff" opacity=".45"/>
          <path d="M0 150h92c8-6 14-8 18-8v58H0z" fill="currentColor" opacity=".85"/>
          <path d="M320 150h-92c-8-6-14-8-18-8v58h110z" fill="currentColor" opacity=".85"/>
          <g fill="none" stroke="currentColor" strokeLinecap="round">
            <path d="M100 146Q160 98 220 146" strokeWidth="6"/>
            <path d="M104 148Q160 112 216 148" strokeWidth="3.5"/>
            <path d="M112 146Q160 122 210 146" strokeWidth="2.4"/>
            <path d="M128 126v22M146 116v32M164 114v34M182 118v30M198 128v18" strokeWidth="2" opacity=".85"/>
          </g>
          <path d="M96 150h128v6H96z" fill="currentColor"/>
          <g fill="currentColor"><circle cx="30" cy="132" r="22"/><circle cx="56" cy="138" r="16"/><circle cx="288" cy="130" r="20"/><circle cx="264" cy="138" r="14"/></g>
          <path d="M0 184c70-8 140-4 200 0s90-4 120-2v18H0z" fill="currentColor"/>
          <path d="M20 186c4-14 10-18 18-20-4 6-8 12-8 20zM46 186c6-12 12-14 20-14-6 4-12 8-14 14zM268 186c-4-14-10-18-18-20 4 6 8 12 8 20z" fill="currentColor"/>
        </symbol>
        <symbol id="mt-m-rajasthan" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="236" cy="60" r="26" fill="#FFF0CC" opacity=".85"/>
          <path d="M0 150c50-20 100-10 150-2s100-16 170-8v60H0z" fill="currentColor" opacity=".25"/>
          <path d="M0 160c40-10 70-40 120-42h100c40 4 70 32 100 40v42H0z" fill="currentColor" opacity=".5"/>
          <g fill="currentColor" opacity=".88">
            <path d="M70 140V96h8v-6h5v6h6v-6h5v6h6v-6h5v6h8v44z"/>
            <path d="M113 140v-34h10v-5h6v5h10v-5h6v5h10v-5h6v5h10v-5h6v5h10v34z"/>
            <path d="M187 140V92h40v48z"/>
            <rect x="191" y="88" width="32" height="4"/>
            <rect x="195" y="80" width="3" height="8"/>
            <rect x="216" y="80" width="3" height="8"/>
            <rect x="192" y="77" width="30" height="3"/>
            <path d="M196 77a11 11 0 0 1 22 0z"/>
            <rect x="206" y="60" width="2" height="7"/>
          </g>
          <path d="M128 132v-8a4 4 0 0 1 8 0v8zM150 132v-8a4 4 0 0 1 8 0v8zM172 132v-8a4 4 0 0 1 8 0v8zM203 120v-10a4 4 0 0 1 8 0v10z" fill="#FFF4E0" opacity=".55"/>
          <path d="M0 182c70-14 140 4 200-4 50-6 90 2 120-2v24H0z" fill="currentColor"/>
        </symbol>
        <symbol id="mt-m-goa" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="244" cy="62" r="22" fill="#FFF0CC" opacity=".92"/>
          <path d="M0 132c60-10 120 0 180-6s100-6 140 0v40H0z" fill="currentColor" opacity=".2"/>
          <rect y="138" width="320" height="34" fill="currentColor" opacity=".28"/>
          <path d="M26 148h66M150 156h92M232 146h60M60 164h50" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".55"/>
          <path d="M206 142l-2-34 24 34z" fill="currentColor" opacity=".8"/><path d="M226 142 244 142 236 148h-28z" fill="currentColor"/>
          <g fill="currentColor" opacity=".92">
            <rect x="70" y="100" width="15" height="50"/><rect x="118" y="100" width="15" height="50"/>
            <path d="M70 100l7.5-14 7.5 14zM118 100l7.5-14 7.5 14z"/>
            <rect x="85" y="116" width="33" height="34"/>
            <path d="M85 116l16.5-13 16.5 13z"/>
            <rect x="100.5" y="84" width="2" height="9"/><rect x="97" y="87" width="9" height="2"/>
          </g>
          <path d="M95 150v-13a6.5 6.5 0 0 1 13 0v13zM74 134v-8a3 3 0 0 1 6 0v8zM122 134v-8a3 3 0 0 1 6 0v8z" fill="#FFF4E0" opacity=".6"/>
          <path d="M0 168c80-10 160-6 230 0s70 4 90 0v32H0z" fill="currentColor"/>
          <use href="#mt-palm-shape" transform="translate(6 24)"/>
          <use href="#mt-palm-shape" transform="translate(-22 40) scale(.7)"/>
        </symbol>
        <symbol id="mt-m-generic" viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
          <circle cx="236" cy="56" r="20" fill="#FFF6DD" opacity=".9"/>
          <path d="M0 118c52-24 104-26 156-8s100 8 164-14v104H0z" fill="currentColor" opacity=".24"/>
          <path d="M0 144c60-22 118-20 172-4s96 6 148-10v70H0z" fill="currentColor" opacity=".45"/>
          <path d="M96 200c10-22 34-34 66-40s56-16 66-34" fill="none" stroke="#FFF1D6" strokeWidth="6" strokeLinecap="round" opacity=".6"/>
          <g fill="currentColor" opacity=".9"><rect x="52" y="124" width="3" height="26"/><circle cx="53.5" cy="120" r="13"/><rect x="262" y="118" width="3" height="30"/><circle cx="263.5" cy="113" r="15"/><rect x="214" y="134" width="2.4" height="18"/><circle cx="215.2" cy="131" r="9"/></g>
          <path d="M0 178c70-12 130-4 190-2s90-6 130-2v26H0z" fill="currentColor"/>
        </symbol>
        <symbol id="mt-m-banner" viewBox="0 80 1600 180" preserveAspectRatio="xMidYMax slice">
          <circle cx="1170" cy="112" r="22" style={{ fill: 'var(--yf-saffron)' }} opacity=".9"/>
          <path d="M0 190C120 170 220 176 330 184S560 170 700 150 900 130 1010 150 1200 140 1290 134L1330 116 1362 98 1396 126 1440 94 1480 124 1530 108 1600 128V260H0z" fill="currentColor" opacity=".2"/>
          <path d="M0 206C100 192 200 196 320 204S520 188 690 194 900 178 1010 188 1230 176 1290 174L1330 156 1366 168 1410 146 1460 164 1520 154 1600 166V260H0z" fill="currentColor" opacity=".38"/>
          <path d="M1440 94l-13 17 7-3 6 7 6-7 7 3zM1362 98l-11 15 6-3 5 6 5-6 6 3zM1480 124l-8 11 5-2 3 4 3-4 5 2z" fill="#fff" opacity=".85"/>
          <rect y="214" width="330" height="16" fill="currentColor" opacity=".24"/>
          <g fill="currentColor" opacity=".92">
            <rect x="186" y="168" width="16" height="46"/><rect x="244" y="168" width="16" height="46"/>
            <path d="M186 168l8-14 8 14zM244 168l8-14 8 14z"/>
            <rect x="202" y="184" width="42" height="30"/>
            <path d="M202 184l21-14 21 14z"/>
            <rect x="222" y="150" width="2" height="9"/><rect x="218.5" y="153" width="9" height="2"/>
          </g>
          <path d="M217 214v-12a6 6 0 0 1 12 0v12z" fill="#fff" opacity=".4"/>
          <path d="M298 204l14 0-7-22z" fill="currentColor" opacity=".8"/><path d="M288 206h32l-5 7h-22z" fill="currentColor"/>
          <use href="#mt-palm-shape" transform="translate(140 214) scale(.62) translate(-262 -146)"/>
          <use href="#mt-palm-shape" transform="translate(120 214) scale(.5) translate(-262 -146)" opacity=".7"/>
          <rect x="330" y="212" width="360" height="20" fill="currentColor" opacity=".22"/>
          <path d="M380 226h60M520 232h90M620 224h50" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".5"/>
          <g transform="translate(350 52)">
            <path d="M114 150c10-22 74-22 84 0z" fill="currentColor" opacity=".72"/>
            <path d="M126 150v-9M142 150v-14M158 150v-16M174 150v-14M190 150v-9" stroke="#fff" strokeWidth="1.5" opacity=".35"/>
            <path d="M104 150h104l-12 12h-80z" fill="currentColor"/>
          </g>
          <use href="#mt-palm-shape" transform="translate(560 214) scale(.85) translate(-262 -146)"/>
          <use href="#mt-palm-shape" transform="translate(660 214) scale(.6) translate(-262 -146)"/>
          <path d="M690 214C730 178 790 172 840 190 880 176 940 178 1010 214z" fill="currentColor" opacity=".55"/>
          <g fill="currentColor"><circle cx="722" cy="198" r="18"/><circle cx="748" cy="206" r="13"/><circle cx="985" cy="200" r="16"/></g>
          <path d="M772 214v-50c10-8 18-10 24-10v60zM912 214v-60c6 0 14 2 24 10v50z" fill="currentColor" opacity=".9"/>
          <g fill="none" stroke="currentColor" strokeLinecap="round" transform="translate(690 64)">
            <path d="M100 150Q160 102 220 150" strokeWidth="6"/>
            <path d="M104 150Q160 116 216 150" strokeWidth="3.5"/>
            <path d="M128 130v20M146 120v30M164 118v32M182 122v28M198 132v18" strokeWidth="2" opacity=".85"/>
          </g>
          <g stroke="#fff" strokeLinecap="round" opacity=".7"><path d="M958 150v50" strokeWidth="5"/><path d="M968 154v44" strokeWidth="3"/></g>
          <path d="M1010 214c60-18 120-8 180-14s100-4 140 14z" fill="currentColor" opacity=".5"/>
          <g fill="currentColor" opacity=".88" transform="translate(1000 74)">
            <path d="M70 140V96h8v-6h5v6h6v-6h5v6h6v-6h5v6h8v44z"/>
            <path d="M113 140v-34h10v-5h6v5h10v-5h6v5h10v-5h6v5h10v-5h6v5h10v34z"/>
            <path d="M187 140V92h40v48z"/><rect x="191" y="88" width="32" height="4"/>
            <rect x="195" y="80" width="3" height="8"/><rect x="216" y="80" width="3" height="8"/>
            <rect x="192" y="77" width="30" height="3"/><path d="M196 77a11 11 0 0 1 22 0z"/><rect x="206" y="60" width="2" height="7"/>
          </g>
          <g fill="currentColor"><path d="M1352 214l7-62 7 62zM1368 216l6-44 6 44zM1450 214l6-52 6 52zM1434 216l5-36 5 36z"/></g>
          <path d="M0 226C140 218 260 228 400 224S640 214 800 224 1050 232 1200 224 1480 216 1600 226V260H0z" fill="currentColor"/>
        </symbol>
      </defs>
    </svg>
  )
}

/** The wide skyline along the banner's bottom edge. */
export function BannerPanorama() {
  return (
    <div className="mt-banner-art" aria-hidden="true">
      <svg focusable="false">
        <use href="#mt-m-banner" width="100%" height="100%" />
      </svg>
    </div>
  )
}

/** Gradient sky plus the region motif. Fills its positioned parent. */
export function TripArt({ region }: { region: TripRegion }) {
  return (
    <div className={`mt-art mt-art--${region}`} aria-hidden="true">
      <svg className="mt-motif" focusable="false">
        <use href={`#mt-m-${region}`} width="100%" height="100%" />
      </svg>
    </div>
  )
}
