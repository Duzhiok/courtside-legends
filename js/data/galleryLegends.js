/**
 * Gallery legends pool: the 40 legends shown in the home Legends Gallery
 * marquee and used as the Duel ladder order.
 *
 * Pure data — lives in js/data/ so non-UI modules (e.g. the Duel store) can
 * import it without depending on a UI module. Previously defined in
 * js/ui/homeShowcase.js (global code review 2026-11-13, finding A-P1-4).
 */
/**
 * The gallery pool: 40 legends, era-balanced (pre-1980: 6, 1980s: 6, 1990s: 8,
 * 2000s: 8, 2010s: 6, 2020s: 6). Every entry was verified against js/data/roster.json
 * (bref + season resolve to a real row) and has real art via legendPhoto().
 * team/pos/ppg/rpg/apg are copied from that roster row; tests pin them to the roster,
 * so a roster correction fails loudly instead of silently drifting.
 */
export const GALLERY_LEGENDS = [
  { bref: "russebi01", season: 1969, name: "比尔·拉塞尔", nameEn: "Bill Russell", team: "BOS", pos: "C", ppg: 9.9, rpg: 19.3, apg: 4.9 },
  { bref: "chambwi01", season: 1972, name: "威尔特·张伯伦", nameEn: "Wilt Chamberlain", team: "LAL", pos: "C", ppg: 14.8, rpg: 19.2, apg: 4.0 },
  { bref: "westje01", season: 1972, name: "杰里·韦斯特", nameEn: "Jerry West", team: "LAL", pos: "SG", ppg: 25.8, rpg: 4.2, apg: 9.7 },
  { bref: "roberos01", season: 1971, name: "奥斯卡·罗伯特森", nameEn: "Oscar Robertson", team: "MIL", pos: "SG", ppg: 19.4, rpg: 5.7, apg: 8.2 },
  { bref: "abdulka01", season: 1971, name: "卡里姆·阿卜杜勒-贾巴尔", nameEn: "Kareem Abdul-Jabbar", team: "MIL", pos: "C", ppg: 31.7, rpg: 16.0, apg: 3.3 },
  { bref: "bayloel01", season: 1970, name: "埃尔金·贝勒", nameEn: "Elgin Baylor", team: "LAL", pos: "SF", ppg: 24.0, rpg: 10.4, apg: 5.4 },
  { bref: "birdla01", season: 1986, name: "拉里·伯德", nameEn: "Larry Bird", team: "BOS", pos: "SF", ppg: 25.8, rpg: 9.8, apg: 6.8 },
  { bref: "johnsma02", season: 1987, name: "魔术师约翰逊", nameEn: "Magic Johnson", team: "LAL", pos: "SG", ppg: 23.9, rpg: 6.3, apg: 12.2 },
  { bref: "ervinju01", season: 1983, name: "朱利叶斯·欧文", nameEn: "Julius Erving", team: "PHI", pos: "SF", ppg: 21.4, rpg: 6.8, apg: 3.7 },
  { bref: "thomais01", season: 1989, name: "伊赛亚·托马斯", nameEn: "Isiah Thomas", team: "DET", pos: "SG", ppg: 18.2, rpg: 3.4, apg: 8.3 },
  { bref: "wilkido01", season: 1986, name: "多米尼克·威尔金斯", nameEn: "Dominique Wilkins", team: "ATL", pos: "SF", ppg: 30.3, rpg: 7.9, apg: 2.6 },
  { bref: "mchalke01", season: 1987, name: "凯文·麦克海尔", nameEn: "Kevin McHale", team: "BOS", pos: "SF", ppg: 26.1, rpg: 9.9, apg: 2.6 },
  { bref: "jordami01", season: 1991, name: "迈克尔·乔丹", nameEn: "Michael Jordan", team: "CHI", pos: "SG", ppg: 31.5, rpg: 6.0, apg: 5.5 },
  { bref: "pippesc01", season: 1992, name: "斯科蒂·皮蓬", nameEn: "Scottie Pippen", team: "CHI", pos: "SF", ppg: 21.0, rpg: 7.7, apg: 7.0 },
  { bref: "malonka01", season: 1997, name: "卡尔·马龙", nameEn: "Karl Malone", team: "UTA", pos: "SF", ppg: 27.4, rpg: 9.9, apg: 4.5 },
  { bref: "stockjo01", season: 1995, name: "约翰·斯托克顿", nameEn: "John Stockton", team: "UTA", pos: "SG", ppg: 14.7, rpg: 3.1, apg: 12.3 },
  { bref: "robinda01", season: 1992, name: "大卫·罗宾逊", nameEn: "David Robinson", team: "SAS", pos: "C", ppg: 23.2, rpg: 12.2, apg: 2.7 },
  { bref: "olajuha01", season: 1994, name: "哈基姆·奥拉朱旺", nameEn: "Hakeem Olajuwon", team: "HOU", pos: "C", ppg: 27.3, rpg: 11.9, apg: 3.6 },
  { bref: "millere01", season: 1995, name: "雷吉·米勒", nameEn: "Reggie Miller", team: "IND", pos: "SG", ppg: 19.6, rpg: 2.6, apg: 3.0 },
  { bref: "paytoga01", season: 1996, name: "加里·佩顿", nameEn: "Gary Payton", team: "SEA", pos: "SG", ppg: 19.3, rpg: 4.2, apg: 7.5 },
  { bref: "bryanko01", season: 2008, name: "科比·布莱恩特", nameEn: "Kobe Bryant", team: "LAL", pos: "SG", ppg: 28.3, rpg: 6.3, apg: 5.4 },
  { bref: "duncati01", season: 2003, name: "蒂姆·邓肯", nameEn: "Tim Duncan", team: "SAS", pos: "C", ppg: 23.3, rpg: 12.9, apg: 3.9 },
  { bref: "garneke01", season: 2004, name: "凯文·加内特", nameEn: "Kevin Garnett", team: "MIN", pos: "SF", ppg: 24.2, rpg: 13.9, apg: 5.0 },
  { bref: "nowitdi01", season: 2007, name: "德克·诺维茨基", nameEn: "Dirk Nowitzki", team: "DAL", pos: "C", ppg: 24.6, rpg: 8.9, apg: 3.4 },
  { bref: "iversal01", season: 2001, name: "阿伦·艾弗森", nameEn: "Allen Iverson", team: "PHI", pos: "SG", ppg: 31.1, rpg: 3.8, apg: 4.6 },
  { bref: "mcgratr01", season: 2003, name: "特雷西·麦克格雷迪", nameEn: "Tracy McGrady", team: "ORL", pos: "SG", ppg: 32.1, rpg: 6.5, apg: 5.5 },
  { bref: "nashst01", season: 2005, name: "史蒂夫·纳什", nameEn: "Steve Nash", team: "PHO", pos: "SG", ppg: 15.5, rpg: 3.3, apg: 11.5 },
  { bref: "wadedw01", season: 2006, name: "德维恩·韦德", nameEn: "Dwyane Wade", team: "MIA", pos: "SG", ppg: 27.2, rpg: 5.7, apg: 6.7 },
  { bref: "jamesle01", season: 2013, name: "勒布朗·詹姆斯", nameEn: "LeBron James", team: "MIA", pos: "PF", ppg: 26.8, rpg: 8.0, apg: 7.3 },
  { bref: "curryst01", season: 2016, name: "斯蒂芬·库里", nameEn: "Stephen Curry", team: "GSW", pos: "PG", ppg: 30.1, rpg: 5.4, apg: 6.7 },
  { bref: "duranke01", season: 2014, name: "凯文·杜兰特", nameEn: "Kevin Durant", team: "OKC", pos: "SF", ppg: 32.0, rpg: 7.4, apg: 5.5 },
  { bref: "leonaka01", season: 2019, name: "科怀·伦纳德", nameEn: "Kawhi Leonard", team: "TOR", pos: "SF", ppg: 26.6, rpg: 7.3, apg: 3.3 },
  { bref: "hardeja01", season: 2018, name: "詹姆斯·哈登", nameEn: "James Harden", team: "HOU", pos: "SG", ppg: 30.4, rpg: 5.4, apg: 8.8 },
  { bref: "westbru01", season: 2017, name: "拉塞尔·威斯布鲁克", nameEn: "Russell Westbrook", team: "OKC", pos: "PG", ppg: 31.6, rpg: 10.7, apg: 10.4 },
  { bref: "jokicni01", season: 2023, name: "尼古拉·约基奇", nameEn: "Nikola Jokic", team: "DEN", pos: "C", ppg: 24.5, rpg: 11.8, apg: 9.8 },
  { bref: "doncilu01", season: 2024, name: "卢卡·东契奇", nameEn: "Luka Doncic", team: "DAL", pos: "PG", ppg: 33.9, rpg: 9.2, apg: 9.8 },
  { bref: "embiijo01", season: 2023, name: "乔尔·恩比德", nameEn: "Joel Embiid", team: "PHI", pos: "C", ppg: 33.1, rpg: 10.2, apg: 4.2 },
  { bref: "tatumja01", season: 2024, name: "杰森·塔图姆", nameEn: "Jayson Tatum", team: "BOS", pos: "PF", ppg: 26.9, rpg: 8.1, apg: 4.9 },
  { bref: "gilgesh01", season: 2024, name: "谢伊·吉尔杰斯-亚历山大", nameEn: "Shai Gilgeous-Alexander", team: "OKC", pos: "PG", ppg: 30.1, rpg: 5.5, apg: 6.2 },
  { bref: "wembavi01", season: 2024, name: "维克托·文班亚马", nameEn: "Victor Wembanyama", team: "SAS", pos: "C", ppg: 21.4, rpg: 10.6, apg: 3.9 },
];
