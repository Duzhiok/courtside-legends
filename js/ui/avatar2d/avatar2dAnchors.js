/**
 * Where each body part is, per character presentation, in art-canvas pixels (1024x1536). The 2D body shape (avatar2dShape.js), the jersey number and the
 * portrait crop all need to know where the shoulders, hands, shorts and legs are on the art that is actually drawn, and the male and the female art are
 * different bodies (the female has the shorts ~170 px higher, the legs start earlier, the hands end earlier, her torso axis is x = 512), so each
 * presentation carries its own measured numbers. Measured with scripts/measure/avatar-body-anchors.mjs on that presentation's layers.
 *
 *   regions       [zero below, full from, full until, zero above] in rows, for each control (see avatar2dShape.js for what each one moves)
 *   armRows       rows that contain an arm or a hand outside the clothes
 *   armAnchors    [y, leftOuter, leftInner, rightInner, rightOuter]: the skin of each arm; "inner" is the edge nearest the torso
 *   legAnchors    [y, leftLegL, leftLegR, rightLegL, rightLegR]: the two legs
 *   number        where the jersey number is painted (art pixels, centre of the digits)
 *   portraitCrop  the head-and-shoulders square of the profile picture
 */
import { NUMBER_ANCHOR } from "./avatar2dJersey.js";
import { PORTRAIT_CROP } from "./avatar2dLayers.js";

const MALE_ARM_ANCHORS = Object.freeze([
  [520, 299, 378, 647, 724], [540, 293, 369, 655, 731], [560, 285, 365, 657, 738], [580, 280, 363, 657, 745], [600, 271, 361, 663, 745],
  [620, 271, 356, 667, 744], [640, 271, 348, 672, 744], [660, 271, 340, 681, 744], [680, 269, 333, 689, 744], [700, 269, 325, 698, 744],
  [720, 267, 317, 705, 743], [740, 261, 313, 707, 738], [760, 264, 323, 703, 742], [780, 265, 330, 692, 742], [800, 262, 333, 689, 743],
  [820, 260, 337, 683, 755], [840, 266, 340, 683, 755], [860, 277, 325, 696, 745], [880, 301, 332, 687, 715],
]);
const MALE_LEG_ANCHORS = Object.freeze([
  [900, 347, 500, 524, 679], [920, 343, 498, 526, 682], [940, 339, 496, 528, 685], [960, 369, 495, 528, 656], [980, 365, 466, 556, 657],
  [1000, 362, 462, 561, 659], [1020, 359, 455, 565, 659], [1040, 353, 447, 572, 664], [1060, 345, 439, 578, 671], [1080, 338, 439, 576, 677],
  [1100, 332, 441, 574, 684], [1120, 326, 443, 572, 687], [1140, 328, 440, 573, 688], [1160, 328, 434, 577, 687], [1180, 330, 425, 586, 683],
  [1200, 332, 418, 594, 679], [1220, 334, 413, 598, 679], [1240, 340, 405, 607, 673], [1260, 343, 400, 611, 670], [1280, 344, 398, 613, 668],
  [1300, 343, 396, 618, 670], [1320, 339, 396, 617, 675], [1340, 323, 404, 609, 691], [1360, 326, 404, 609, 689], [1380, 319, 406, 607, 695],
  [1400, 309, 409, 604, 706], [1420, 297, 411, 602, 720], [1440, 293, 387, 628, 726],
]);
/** Measured on the female layers (build_female.py output): torso 363..663 at the shoulders, hands end at ~y 850, shorts rows ~680-856, socks from ~1238. */
const FEMALE_ARM_ANCHORS = Object.freeze([
  [480, 333, 396, 629, 691], [500, 327, 389, 636, 698], [520, 317, 378, 646, 708], [540, 305, 373, 652, 719], [560, 297, 366, 657, 729],
  [580, 290, 363, 663, 733], [600, 285, 353, 672, 737], [620, 281, 340, 684, 741], [640, 275, 327, 696, 747], [660, 270, 314, 707, 754],
  [680, 263, 304, 718, 759], [700, 257, 295, 726, 766], [720, 253, 295, 725, 769], [740, 247, 296, 723, 773], [760, 240, 292, 727, 779],
  [780, 240, 292, 726, 779], [800, 245, 292, 729, 775], [820, 252, 288, 730, 767], [840, 266, 285, 734, 754],
]);
const FEMALE_LEG_ANCHORS = Object.freeze([
  [800, 357, 510, 519, 669], [820, 352, 508, 521, 666], [840, 364, 507, 523, 660], [860, 366, 486, 538, 660], [880, 368, 481, 543, 658],
  [900, 369, 475, 548, 656], [920, 371, 471, 554, 655], [940, 374, 467, 558, 651], [960, 375, 464, 560, 649], [980, 372, 460, 563, 652],
  [1000, 369, 456, 566, 653], [1020, 365, 449, 573, 656], [1040, 358, 439, 582, 663], [1060, 351, 437, 585, 672], [1080, 344, 437, 582, 678],
  [1100, 341, 437, 582, 682], [1120, 339, 437, 582, 680], [1140, 341, 432, 585, 679], [1160, 342, 425, 592, 677], [1180, 345, 417, 600, 675],
  [1200, 345, 412, 605, 673], [1220, 345, 408, 610, 672], [1240, 349, 401, 616, 670], [1260, 348, 389, 620, 670], [1280, 348, 393, 624, 666],
  [1300, 348, 384, 627, 669], [1320, 333, 399, 617, 684], [1340, 333, 400, 617, 685], [1360, 335, 398, 618, 682], [1380, 329, 402, 615, 689],
  [1400, 318, 405, 611, 700], [1420, 307, 406, 621, 711], [1440, 304, 395, 620, 713],
]);

export const ANCHORS = Object.freeze({
  male: Object.freeze({
    axisX: 510,
    regions: Object.freeze({
      shoulders: [285, 340, 500, 760],   // fades slowly down the arms, so a narrow shoulder does not leave the arms bowed outward
      arms: [540, 620, 800, 880],       // starts below the shoulder cap: thickening the cap itself bows the arm like a sausage
      waist: [790, 850, 930, 1000],   // belt and shorts only: it ends where the thighs begin, so the waist never thickens a leg
      legs: [940, 1010, 1330, 1400],
    }),
    armRows: Object.freeze([520, 900]),
    armAnchors: MALE_ARM_ANCHORS,
    legAnchors: MALE_LEG_ANCHORS,
    number: NUMBER_ANCHOR,
    portraitCrop: PORTRAIT_CROP,
  }),
  female: Object.freeze({
    axisX: 512,
    regions: Object.freeze({
      shoulders: [285, 340, 480, 780],
      arms: [470, 540, 690, 790],     // below the shoulder cap, and it ends before the hand (hands 780-850)
      waist: [650, 700, 780, 856],    // the jersey hem (~690) and the shorts (680-856); the thighs begin at 856
      legs: [830, 880, 1120, 1240],   // ends where the socks begin (~1238): the feet are not scaled
    }),
    armRows: Object.freeze([470, 860]),
    armAnchors: FEMALE_ARM_ANCHORS,
    legAnchors: FEMALE_LEG_ANCHORS,
    number: Object.freeze({ x: 514, y: 440, size: 90, maxWidth: 170 }),   // where the master's own number sat; the chest is ~216 wide there
    portraitCrop: Object.freeze({ x: 345, y: 46, size: 340 }),
  }),
});

/** The numbers for a presentation; anything unknown is the male set (the same fallback the layers use). */
export const anchorsFor = (presentation) => ANCHORS[presentation] || ANCHORS.male;
