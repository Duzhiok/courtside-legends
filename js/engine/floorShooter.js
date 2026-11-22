/** A man the offence treats as a spacer: a real three-point shooter, a spot/stretch style, or one ordered to stand and shoot. */
export function isFloorShooter(p) {
  if (!p) return false;
  const threeTend = p.threeTend ?? 30;
  const three = p.three || 40;
  return (
    (threeTend >= 42 && three >= 65) ||
    p.offenseStyle === "spot" ||
    p.offenseStyle === "stretch" ||
    p.orders?.action === "spot" ||
    p.orders?.attack === "perimeter"
  );
}
