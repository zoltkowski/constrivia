type Position={x:number;y:number};

/** Incenter and distance to AB, computed relative to A to limit cancellation. */
export function triangleIncircle(a:Position,b:Position,c:Position) {
  if(![a,b,c].every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)))return null;
  const ab={x:b.x-a.x,y:b.y-a.y},ac={x:c.x-a.x,y:c.y-a.y};
  const oppositeA=Math.hypot(b.x-c.x,b.y-c.y),oppositeB=Math.hypot(ac.x,ac.y),oppositeC=Math.hypot(ab.x,ab.y);
  const perimeter=oppositeA+oppositeB+oppositeC;
  const radius=Math.abs(ab.x*ac.y-ab.y*ac.x)/perimeter;
  if(!(radius>1e-6)||![perimeter,radius].every(Number.isFinite))return null;
  const local={x:(oppositeB*ab.x+oppositeC*ac.x)/perimeter,y:(oppositeB*ab.y+oppositeC*ac.y)/perimeter};
  const center={x:a.x+local.x,y:a.y+local.y};
  const t=(local.x*ab.x+local.y*ab.y)/(oppositeC*oppositeC);
  const vector={x:ab.x*t-local.x,y:ab.y*t-local.y};
  return {center,radius,vector};
}
