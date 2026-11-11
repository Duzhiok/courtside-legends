/**
 * Hometown Legends (ADR-009, M4-B): the curated location table.
 *
 * Static data only — never written into a save (saves hold the player's
 * free-text identityPlaces strings; this table is how those strings are
 * matched). Hierarchy is city -> region -> country, which is what the
 * fallback resolver walks. MVP curation: 15 cities, quality over coverage;
 * any place not listed here still works via country fallback / the
 * chosen-idol entry (see hometown.js).
 */
export const LOCATIONS = [
  // China
  { id: "CN", level: "country", parentId: null, names: { zh: "中国", en: "China" }, aliases: [] },
  { id: "CN-SH", level: "region", parentId: "CN", names: { zh: "上海", en: "Shanghai" }, aliases: [] },
  { id: "CN-SH-SHANGHAI", level: "city", parentId: "CN-SH", names: { zh: "上海", en: "Shanghai" }, aliases: [] },
  { id: "CN-BJ", level: "region", parentId: "CN", names: { zh: "北京", en: "Beijing" }, aliases: [] },
  { id: "CN-BJ-BEIJING", level: "city", parentId: "CN-BJ", names: { zh: "北京", en: "Beijing" }, aliases: [] },
  // United States
  { id: "US", level: "country", parentId: null, names: { zh: "美国", en: "United States" }, aliases: ["USA", "US", "America"] },
  { id: "US-OH", level: "region", parentId: "US", names: { zh: "俄亥俄州", en: "Ohio" }, aliases: [] },
  { id: "US-OH-AKRON", level: "city", parentId: "US-OH", names: { zh: "阿克伦", en: "Akron" }, aliases: [] },
  { id: "US-IL", level: "region", parentId: "US", names: { zh: "伊利诺伊州", en: "Illinois" }, aliases: [] },
  { id: "US-IL-CHICAGO", level: "city", parentId: "US-IL", names: { zh: "芝加哥", en: "Chicago" }, aliases: [] },
  { id: "US-CA", level: "region", parentId: "US", names: { zh: "加利福尼亚州", en: "California" }, aliases: [] },
  { id: "US-CA-LOS-ANGELES", level: "city", parentId: "US-CA", names: { zh: "洛杉矶", en: "Los Angeles" }, aliases: ["LA"] },
  { id: "US-NY", level: "region", parentId: "US", names: { zh: "纽约州", en: "New York" }, aliases: [] },
  { id: "US-NY-NEW-YORK", level: "city", parentId: "US-NY", names: { zh: "纽约", en: "New York City" }, aliases: ["New York", "NYC"] },
  { id: "US-PA", level: "region", parentId: "US", names: { zh: "宾夕法尼亚州", en: "Pennsylvania" }, aliases: [] },
  { id: "US-PA-PHILADELPHIA", level: "city", parentId: "US-PA", names: { zh: "费城", en: "Philadelphia" }, aliases: [] },
  { id: "US-TX", level: "region", parentId: "US", names: { zh: "得克萨斯州", en: "Texas" }, aliases: [] },
  { id: "US-TX-HOUSTON", level: "city", parentId: "US-TX", names: { zh: "休斯顿", en: "Houston" }, aliases: [] },
  // Canada
  { id: "CA", level: "country", parentId: null, names: { zh: "加拿大", en: "Canada" }, aliases: [] },
  { id: "CA-ON", level: "region", parentId: "CA", names: { zh: "安大略省", en: "Ontario" }, aliases: [] },
  { id: "CA-ON-TORONTO", level: "city", parentId: "CA-ON", names: { zh: "多伦多", en: "Toronto" }, aliases: [] },
  // Greece
  { id: "GR", level: "country", parentId: null, names: { zh: "希腊", en: "Greece" }, aliases: [] },
  { id: "GR-ATT", level: "region", parentId: "GR", names: { zh: "阿提卡", en: "Attica" }, aliases: [] },
  { id: "GR-ATT-ATHENS", level: "city", parentId: "GR-ATT", names: { zh: "雅典", en: "Athens" }, aliases: [] },
  // Slovenia
  { id: "SI", level: "country", parentId: null, names: { zh: "斯洛文尼亚", en: "Slovenia" }, aliases: [] },
  { id: "SI-CENTRAL", level: "region", parentId: "SI", names: { zh: "中斯洛文尼亚", en: "Central Slovenia" }, aliases: [] },
  { id: "SI-CENTRAL-LJUBLJANA", level: "city", parentId: "SI-CENTRAL", names: { zh: "卢布尔雅那", en: "Ljubljana" }, aliases: [] },
  // Germany
  { id: "DE", level: "country", parentId: null, names: { zh: "德国", en: "Germany" }, aliases: [] },
  { id: "DE-BY", level: "region", parentId: "DE", names: { zh: "巴伐利亚", en: "Bavaria" }, aliases: [] },
  { id: "DE-BY-WURZBURG", level: "city", parentId: "DE-BY", names: { zh: "维尔茨堡", en: "Wurzburg" }, aliases: ["Würzburg"] },
  // Spain
  { id: "ES", level: "country", parentId: null, names: { zh: "西班牙", en: "Spain" }, aliases: [] },
  { id: "ES-CT", level: "region", parentId: "ES", names: { zh: "加泰罗尼亚", en: "Catalonia" }, aliases: [] },
  { id: "ES-CT-BARCELONA", level: "city", parentId: "ES-CT", names: { zh: "巴塞罗那", en: "Barcelona" }, aliases: [] },
  // Argentina
  { id: "AR", level: "country", parentId: null, names: { zh: "阿根廷", en: "Argentina" }, aliases: [] },
  { id: "AR-BA", level: "region", parentId: "AR", names: { zh: "布宜诺斯艾利斯省", en: "Buenos Aires Province" }, aliases: [] },
  { id: "AR-BA-BAHIA-BLANCA", level: "city", parentId: "AR-BA", names: { zh: "布兰卡港", en: "Bahia Blanca" }, aliases: ["Bahía Blanca"] },
  // Australia
  { id: "AU", level: "country", parentId: null, names: { zh: "澳大利亚", en: "Australia" }, aliases: [] },
  { id: "AU-VIC", level: "region", parentId: "AU", names: { zh: "维多利亚州", en: "Victoria" }, aliases: [] },
  { id: "AU-VIC-MELBOURNE", level: "city", parentId: "AU-VIC", names: { zh: "墨尔本", en: "Melbourne" }, aliases: [] },
];
