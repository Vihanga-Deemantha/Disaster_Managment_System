import type { MapPoint } from '../domain/mapMessage';

/** Only numeric coordinates enter this document; report text is never interpolated into HTML. */
export function mapDocument(centre: MapPoint): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" onerror="fail()">
<style>html,body,#map{height:100%;margin:0;background:#f5f2ee}.pin{background:#91491f;border:3px solid white;border-radius:50%;box-shadow:0 1px 5px #333}</style>
</head><body><div id="map"></div><script>
function post(value){window.ReactNativeWebView.postMessage(JSON.stringify(value));}
function fail(){post({type:'ERROR'});}
var timeout=setTimeout(fail,15000),map,marker,editable=false;
function start(){
  try {
    map=L.map('map').setView([${centre.lat},${centre.lng}],13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).on('tileerror',fail).addTo(map);
    var icon=L.divIcon({className:'pin',iconSize:[20,20],iconAnchor:[10,10]});
    function place(point){
      if(!marker){
        marker=L.marker([point.lat,point.lng],{icon:icon,draggable:editable}).addTo(map);
        marker.on('dragend',function(){if(editable){var p=marker.getLatLng();post({type:'PIN',lat:p.lat,lng:p.lng});}});
      }else marker.setLatLng([point.lat,point.lng]);
      if(editable)marker.dragging.enable();else marker.dragging.disable();
    }
    window.updatePin=function(point,canEdit,centre){
      editable=canEdit;
      if(point){place(point);if(!map.getBounds().contains([point.lat,point.lng]))map.panTo([point.lat,point.lng]);}
      else {if(marker){map.removeLayer(marker);marker=null;}map.panTo([centre.lat,centre.lng]);}
    };
    map.on('click',function(event){if(editable){place(event.latlng);post({type:'PIN',lat:event.latlng.lat,lng:event.latlng.lng});}});
    clearTimeout(timeout);post({type:'READY'});
  }catch(error){fail();}
}
</script><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" onload="start()" onerror="fail()"></script></body></html>`;
}
