/* Every circulating ISO 4217 currency as a DAI-network ticker.
 *
 * The DAI chain mirrors a national currency as `ai` + its ISO 4217 code —
 * aiETB for the Ethiopian birr, aiBTN for the ngultrum. ASCII on the wire,
 * because tickers travel through tx hashes, APIs and SDKs; the `αι` form is
 * for display only. KGS is the one exception: the Kyrgyz som shipped as KGST
 * before the convention existed and keeps that name on-chain.
 *
 * THIS TABLE IS NOT A LIST OF WHAT TRADES. It is naming and search metadata.
 * Which currencies actually exist is decided by the chain — every stablecoin
 * is minted once in the genesis snapshot, so the live set is whatever
 * /api/p2p/currencies returns and nothing here can add to it. A row here for a
 * currency the node has never heard of simply never appears in the UI.
 *
 * Source: CLDR territory_currencies, tender-only, filtered to those legal
 * tender somewhere today, plus six that have no ISO code at all. 161 rows —
 * fewer than the ~195 countries, because
 * the euro, the US dollar and the two CFA francs are each shared by many.
 *
 * Columns: ISO code, sign, English name, countries that use it.
 */
(function (global) {
  const TABLE = [
    ['AED', 'د.إ.‏', 'United Arab Emirates Dirham', 'United Arab Emirates'],
    ['AFN', '؋', 'Afghan Afghani', 'Afghanistan'],
    ['ALL', 'Lekë', 'Albanian Lek', 'Albania'],
    ['AMD', '֏', 'Armenian Dram', 'Armenia'],
    ['ANG', 'NAf.', 'Netherlands Antillean Guilder', 'Curaçao, Sint Maarten'],
    ['AOA', 'Kz', 'Angolan Kwanza', 'Angola'],
    ['ARS', '$', 'Argentine Peso', 'Argentina'],
    ['AUD', 'A$', 'Australian Dollar', 'Australia, Cocos (Keeling) Islands, Christmas Island, Heard & McDonald Islands, Kiribati, Norfolk Island, Nauru, Tuvalu'],
    ['AWG', 'Afl.', 'Aruban Florin', 'Aruba'],
    ['AZN', '₼', 'Azerbaijani Manat', 'Azerbaijan'],
    ['BAM', 'KM', 'Bosnia-Herzegovina Convertible Mark', 'Bosnia & Herzegovina'],
    ['BBD', '$', 'Barbadian Dollar', 'Barbados'],
    ['BDT', '৳', 'Bangladeshi Taka', 'Bangladesh'],
    ['BGN', 'лв.', 'Bulgarian Lev', 'Bulgaria'],
    ['BHD', 'د.ب.‏', 'Bahraini Dinar', 'Bahrain'],
    ['BIF', 'FBu', 'Burundian Franc', 'Burundi'],
    ['BMD', '$', 'Bermudan Dollar', 'Bermuda'],
    ['BND', '$', 'Brunei Dollar', 'Brunei'],
    ['BOB', 'Bs', 'Bolivian Boliviano', 'Bolivia'],
    ['BRL', 'R$', 'Brazilian Real', 'Brazil'],
    ['BSD', '$', 'Bahamian Dollar', 'Bahamas'],
    ['BTN', 'Nu.', 'Bhutanese Ngultrum', 'Bhutan'],
    ['BWP', 'P', 'Botswanan Pula', 'Botswana'],
    ['BYN', 'Br', 'Belarusian Ruble', 'Belarus'],
    ['BZD', '$', 'Belize Dollar', 'Belize'],
    ['CAD', 'CA$', 'Canadian Dollar', 'Canada'],
    ['CDF', 'FC', 'Congolese Franc', 'Congo - Kinshasa'],
    ['CHF', '', 'Swiss Franc', 'Switzerland, Liechtenstein'],
    ['CLP', '$', 'Chilean Peso', 'Chile'],
    ['CNY', 'CN¥', 'Chinese Yuan', 'China'],
    ['COP', '$', 'Colombian Peso', 'Colombia'],
    ['CRC', '₡', 'Costa Rican Colón', 'Costa Rica'],
    ['CUC', '', 'Cuban Convertible Peso', 'Cuba'],
    ['CUP', '$', 'Cuban Peso', 'Cuba'],
    ['CVE', '​', 'Cape Verdean Escudo', 'Cape Verde'],
    ['CZK', 'Kč', 'Czech Koruna', 'Czechia'],
    ['DJF', 'Fdj', 'Djiboutian Franc', 'Djibouti'],
    ['DKK', 'kr.', 'Danish Krone', 'Denmark, Faroe Islands, Greenland'],
    ['DOP', 'RD$', 'Dominican Peso', 'Dominican Republic'],
    ['DZD', 'DA', 'Algerian Dinar', 'Algeria'],
    ['EGP', 'ج.م.‏', 'Egyptian Pound', 'Egypt'],
    ['ERN', 'Nfk', 'Eritrean Nakfa', 'Eritrea'],
    ['ETB', 'Br', 'Ethiopian Birr', 'Ethiopia'],
    ['EUR', '€', 'Euro', 'Andorra, Austria, Åland Islands, Belgium, St. Barthélemy, Cyprus, Germany, Ceuta & Melilla, Estonia, Spain, European Union, Finland, France, French Guiana, Guadeloupe, Greece, Canary Islands, Ireland, Italy, Lithuania, Luxembourg, Latvia, Monaco, Montenegro, St. Martin, Martinique, Malta, Netherlands, St. Pierre & Miquelon, Portugal, Réunion, Slovenia, Slovakia, San Marino, French Southern Territories, Vatican City, Kosovo, Mayotte'],
    ['FJD', '$', 'Fijian Dollar', 'Fiji'],
    ['FKP', '£', 'Falkland Islands Pound', 'Falkland Islands'],
    ['GBP', '£', 'British Pound', 'United Kingdom, Guernsey, South Georgia & South Sandwich Islands, Isle of Man, Jersey, Tristan da Cunha'],
    ['GEL', '₾', 'Georgian Lari', 'Georgia'],
    ['GHS', 'GH₵', 'Ghanaian Cedi', 'Ghana'],
    ['GIP', '£', 'Gibraltar Pound', 'Gibraltar'],
    ['GMD', 'D', 'Gambian Dalasi', 'Gambia'],
    ['GNF', 'FG', 'Guinean Franc', 'Guinea'],
    ['GTQ', 'Q', 'Guatemalan Quetzal', 'Guatemala'],
    ['GYD', '$', 'Guyanaese Dollar', 'Guyana'],
    ['HKD', 'HK$', 'Hong Kong Dollar', 'Hong Kong SAR China'],
    ['HNL', 'L', 'Honduran Lempira', 'Honduras'],
    ['HRK', 'kn', 'Croatian Kuna', 'Croatia'],
    ['HTG', 'G', 'Haitian Gourde', 'Haiti'],
    ['HUF', 'Ft', 'Hungarian Forint', 'Hungary'],
    ['IDR', 'Rp', 'Indonesian Rupiah', 'Indonesia'],
    ['ILS', '₪', 'Israeli New Shekel', 'Israel, Palestinian Territories'],
    ['INR', '₹', 'Indian Rupee', 'Bhutan, India'],
    ['IQD', 'د.ع.‏', 'Iraqi Dinar', 'Iraq'],
    ['IRR', 'ریال', 'Iranian Rial', 'Iran'],
    ['ISK', '', 'Icelandic Króna', 'Iceland'],
    ['JMD', '$', 'Jamaican Dollar', 'Jamaica'],
    ['JOD', 'د.أ.‏', 'Jordanian Dinar', 'Jordan, Palestinian Territories'],
    ['JPY', '¥', 'Japanese Yen', 'Japan'],
    ['KES', 'Ksh', 'Kenyan Shilling', 'Kenya'],
    ['KGS', 'сом', 'Kyrgystani Som', 'Kyrgyzstan'],
    ['KHR', '៛', 'Cambodian Riel', 'Cambodia'],
    ['KMF', 'CF', 'Comorian Franc', 'Comoros'],
    ['KPW', '', 'North Korean Won', 'North Korea'],
    ['KRW', '₩', 'South Korean Won', 'South Korea'],
    ['KWD', 'د.ك.‏', 'Kuwaiti Dinar', 'Kuwait'],
    ['KYD', '$', 'Cayman Islands Dollar', 'Cayman Islands'],
    ['KZT', '₸', 'Kazakhstani Tenge', 'Kazakhstan'],
    ['LAK', '₭', 'Laotian Kip', 'Laos'],
    ['LBP', 'ل.ل.‏', 'Lebanese Pound', 'Lebanon'],
    ['LKR', 'Rs.', 'Sri Lankan Rupee', 'Sri Lanka'],
    ['LRD', '$', 'Liberian Dollar', 'Liberia'],
    ['LSL', '', 'Lesotho Loti', 'Lesotho'],
    ['LYD', 'د.ل.‏', 'Libyan Dinar', 'Libya'],
    ['MAD', 'د.م.‏', 'Moroccan Dirham', 'Western Sahara, Morocco'],
    ['MDL', 'L', 'Moldovan Leu', 'Moldova'],
    ['MGA', 'Ar', 'Malagasy Ariary', 'Madagascar'],
    ['MKD', 'den', 'Macedonian Denar', 'North Macedonia'],
    ['MMK', 'K', 'Myanmar Kyat', 'Myanmar (Burma)'],
    ['MNT', '₮', 'Mongolian Tugrik', 'Mongolia'],
    ['MOP', 'MOP$', 'Macanese Pataca', 'Macao SAR China'],
    ['MRU', 'UM', 'Mauritanian Ouguiya', 'Mauritania'],
    ['MUR', 'Rs', 'Mauritian Rupee', 'Mauritius'],
    ['MVR', 'Rf', 'Maldivian Rufiyaa', 'Maldives'],
    ['MWK', 'MK', 'Malawian Kwacha', 'Malawi'],
    ['MXN', 'MX$', 'Mexican Peso', 'Mexico'],
    ['MYR', 'RM', 'Malaysian Ringgit', 'Malaysia'],
    ['MZN', 'MTn', 'Mozambican Metical', 'Mozambique'],
    ['NAD', '$', 'Namibian Dollar', 'Namibia'],
    ['NGN', '₦', 'Nigerian Naira', 'Nigeria'],
    ['NIO', 'C$', 'Nicaraguan Córdoba', 'Nicaragua'],
    ['NOK', 'kr', 'Norwegian Krone', 'Bouvet Island, Norway, Svalbard & Jan Mayen'],
    ['NPR', 'नेरू', 'Nepalese Rupee', 'Nepal'],
    ['NZD', 'NZ$', 'New Zealand Dollar', 'Cook Islands, Niue, New Zealand, Pitcairn Islands, Tokelau'],
    ['OMR', 'ر.ع.‏', 'Omani Rial', 'Oman'],
    ['PAB', 'B/.', 'Panamanian Balboa', 'Panama'],
    ['PEN', 'S/', 'Peruvian Sol', 'Peru'],
    ['PGK', 'K', 'Papua New Guinean Kina', 'Papua New Guinea'],
    ['PHP', '₱', 'Philippine Peso', 'Philippines'],
    ['PKR', 'ر', 'Pakistani Rupee', 'Pakistan'],
    ['PLN', 'zł', 'Polish Zloty', 'Poland'],
    ['PYG', 'Gs.', 'Paraguayan Guarani', 'Paraguay'],
    ['QAR', 'ر.ق.‏', 'Qatari Rial', 'Qatar'],
    ['RON', '', 'Romanian Leu', 'Romania'],
    ['RSD', '', 'Serbian Dinar', 'Serbia'],
    ['RUB', '₽', 'Russian Ruble', 'Russia'],
    ['RWF', 'RF', 'Rwandan Franc', 'Rwanda'],
    ['SAR', 'ر.س.‏', 'Saudi Riyal', 'Saudi Arabia'],
    ['SBD', '$', 'Solomon Islands Dollar', 'Solomon Islands'],
    ['SCR', 'SR', 'Seychellois Rupee', 'Seychelles'],
    ['SDG', 'ج.س.', 'Sudanese Pound', 'Sudan'],
    ['SEK', 'kr', 'Swedish Krona', 'Sweden'],
    ['SGD', '$', 'Singapore Dollar', 'Singapore'],
    ['SHP', '£', 'St. Helena Pound', 'Ascension Island, St. Helena'],
    ['SLL', 'Le', 'Sierra Leonean Leone', 'Sierra Leone'],
    ['SOS', 'S', 'Somali Shilling', 'Somalia'],
    ['SRD', '$', 'Surinamese Dollar', 'Suriname'],
    ['SSP', '£', 'South Sudanese Pound', 'South Sudan'],
    ['STN', 'Db', 'São Tomé & Príncipe Dobra', 'São Tomé & Príncipe'],
    ['SYP', 'ل.س.‏', 'Syrian Pound', 'Syria'],
    ['SZL', 'E', 'Swazi Lilangeni', 'Eswatini'],
    ['THB', '฿', 'Thai Baht', 'Thailand'],
    ['TJS', '', 'Tajikistani Somoni', 'Tajikistan'],
    ['TMT', '', 'Turkmenistani Manat', 'Turkmenistan'],
    ['TND', 'د.ت.‏', 'Tunisian Dinar', 'Tunisia'],
    ['TOP', 'T$', 'Tongan Paʻanga', 'Tonga'],
    ['TRY', '₺', 'Turkish Lira', 'Turkey'],
    ['TTD', '$', 'Trinidad & Tobago Dollar', 'Trinidad & Tobago'],
    ['TWD', 'NT$', 'New Taiwan Dollar', 'Taiwan'],
    ['TZS', 'TSh', 'Tanzanian Shilling', 'Tanzania'],
    ['UAH', '₴', 'Ukrainian Hryvnia', 'Ukraine'],
    ['UGX', 'USh', 'Ugandan Shilling', 'Uganda'],
    ['USD', '$', 'US Dollar', 'American Samoa, Caribbean Netherlands, Diego Garcia, Ecuador, Micronesia, Guam, Haiti, British Indian Ocean Territory, Marshall Islands, Northern Mariana Islands, Panama, Puerto Rico, Palau, El Salvador, Turks & Caicos Islands, Timor-Leste, U.S. Outlying Islands, United States, British Virgin Islands, U.S. Virgin Islands, Zimbabwe'],
    ['UYU', '$', 'Uruguayan Peso', 'Uruguay'],
    ['UZS', 'сўм', 'Uzbekistani Som', 'Uzbekistan'],
    ['VES', 'Bs.S', 'Venezuelan Bolívar', 'Venezuela'],
    ['VND', '₫', 'Vietnamese Dong', 'Vietnam'],
    ['VUV', 'VT', 'Vanuatu Vatu', 'Vanuatu'],
    ['WST', 'WS$', 'Samoan Tala', 'Samoa'],
    ['XAF', 'FCFA', 'Central African CFA Franc', 'Central African Republic, Congo - Brazzaville, Cameroon, Gabon, Equatorial Guinea, Chad'],
    ['XCD', 'EC$', 'East Caribbean Dollar', 'Antigua & Barbuda, Anguilla, Dominica, Grenada, St. Kitts & Nevis, St. Lucia, Montserrat, St. Vincent & Grenadines'],
    ['XOF', 'F CFA', 'West African CFA Franc', 'Burkina Faso, Benin, Côte d’Ivoire, Guinea-Bissau, Mali, Niger, Senegal, Togo'],
    ['XPF', 'CFPF', 'CFP Franc', 'New Caledonia, French Polynesia, Wallis & Futuna'],
    ['YER', 'ر.ي.‏', 'Yemeni Rial', 'Yemen'],
    ['ZAR', 'R', 'South African Rand', 'Lesotho, Namibia, South Africa'],
    ['ZMW', 'K', 'Zambian Kwacha', 'Zambia'],

    /* No ISO 4217 code, so absent from CLDR — appended rather than interleaved
       so nobody mistakes these for assigned codes. The codes below are the
       widely-used unofficial ones and cannot collide with ISO, which never
       assigns them.

       The first three are issued by unrecognised states and circulate at their
       own rate. The last three are 1:1 local issues of a currency already in
       this table (AUD, AUD, DKK) — the same money under a local design, not a
       separate float, which matters if anyone trades them against the parent. */
    ['PRB', 'р.', 'Transnistrian Ruble', 'Transnistria'],
    ['SLS', 'Sl',  'Somaliland Shilling', 'Somaliland'],
    ['APS', 'ა',   'Abkhazian Apsar', 'Abkhazia'],
    ['KID', '$',   'Kiribati Dollar', 'Kiribati'],
    ['TVD', '$',   'Tuvaluan Dollar', 'Tuvalu'],
    ['FOK', 'kr',  'Faroese Króna', 'Faroe Islands'],
  ];

  /* KGS predates the ai-prefix convention and is KGST on-chain. Anything else
     is a mechanical ai + ISO. */
  const ISO_OVERRIDE = { KGS: 'KGST' };
  const ISO_OVERRIDE_TICKERS = new Set(Object.values(ISO_OVERRIDE));

  function tickerFor(iso) {
    return ISO_OVERRIDE[iso] || ('ai' + iso);
  }

  /* 'ai' + ISO renders as 'αι' + ISO. The override keeps its own name — KGST
     is written KGST everywhere, never αιKGS. */
  function displayFor(ticker) {
    if (ISO_OVERRIDE_TICKERS.has(ticker)) return ticker;
    return /^ai[A-Z]{3}$/.test(ticker) ? '\u03b1\u03b9' + ticker.slice(2) : ticker;
  }

  const byTicker = new Map();
  const byIso = new Map();
  for (const [iso, sign, name, countries] of TABLE) {
    const rec = {
      iso,
      ticker: tickerFor(iso),
      display: displayFor(tickerFor(iso)),
      sign,
      name,
      countries,
    };
    byTicker.set(rec.ticker, rec);
    byIso.set(iso, rec);
  }

  /** Metadata for a DAI-network ticker, or null if it is not a currency
      mirror (DAI itself, or an off-chain quote like USDT-TRC20). */
  function meta(ticker) { return byTicker.get(ticker) || null; }
  function fromIso(iso) { return byIso.get(String(iso || '').toUpperCase()) || null; }

  /** Every ticker this table knows, in ISO order. Not what the node lists. */
  function tickers() { return Array.from(byTicker.keys()); }

  /** Free-text match over ticker, ISO, currency name and country names, so
      "Bhutan", "ngultrum", "BTN" and "aiBTN" all find the same row. */
  function matches(ticker, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    const r = byTicker.get(ticker);
    if (!r) return ticker.toLowerCase().includes(q);
    return r.ticker.toLowerCase().includes(q)
      || r.display.toLowerCase().includes(q)
      || r.iso.toLowerCase().includes(q)
      || r.name.toLowerCase().includes(q)
      || r.countries.toLowerCase().includes(q);
  }

  /** One line of context for a ticker: "Bhutanese Ngultrum · Bhutan". */
  function subtitle(ticker) {
    const r = byTicker.get(ticker);
    if (!r) return '';
    return r.countries ? r.name + ' \u00b7 ' + r.countries : r.name;
  }

  global.AistCurrencies = { meta, fromIso, tickers, matches, subtitle, tickerFor, displayFor, TABLE };
})(window);
