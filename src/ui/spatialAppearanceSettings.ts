import {normalizeSpatialAppearance,type SpatialAppearance} from '../canvas/spatialAppearance';

export function initSpatialAppearanceSettings(deps:{getValues:()=>SpatialAppearance;saveValue:(key:keyof SpatialAppearance,value:number|string|boolean)=>void}) {
  const intensity=document.getElementById('spatialBackIntensity') as HTMLInputElement|null;
  const value=document.getElementById('spatialBackIntensityValue');
  const style=document.getElementById('spatialBackEdgeStyle') as HTMLSelectElement|null;
  const hidden=document.getElementById('spatialBackHidden') as HTMLInputElement|null;
  const refresh=()=>{
    const settings=normalizeSpatialAppearance(deps.getValues());
    if(intensity){intensity.value=String(Math.round(settings.spatialBackIntensity*100));intensity.disabled=settings.spatialBackHidden;intensity.setAttribute('aria-valuetext',intensity.value+'%');}
    if(value)value.textContent=Math.round(settings.spatialBackIntensity*100)+'%';
    if(style){style.value=settings.spatialBackEdgeStyle;style.disabled=settings.spatialBackHidden;}
    if(hidden)hidden.checked=settings.spatialBackHidden;
  };
  intensity?.addEventListener('input',()=>{deps.saveValue('spatialBackIntensity',Math.max(0,Math.min(100,Number(intensity.value)))/100);refresh();});
  style?.addEventListener('change',()=>{deps.saveValue('spatialBackEdgeStyle',style.value);refresh();});
  hidden?.addEventListener('change',()=>{deps.saveValue('spatialBackHidden',hidden.checked);refresh();});
  refresh();return{refresh};
}
