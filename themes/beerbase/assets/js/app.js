// Helpers
// adopted from https://github.com/gabmontes/fast-haversine
const R = 6378;
const PI_360 = Math.PI / 360;

function distance(lat1, lon1, lat2, lon2) {
  const cLat = Math.cos((lat1 + lat2) * PI_360);
  const dLat = (lat2 - lat1) * PI_360;
  const dLon = (lon2 - lon1) * PI_360;

  const f = dLat * dLat + cLat * cLat * dLon * dLon;
  const c = 2 * Math.atan2(Math.sqrt(f), Math.sqrt(1 - f));

  return R * c;
}

// via https://stackoverflow.com/a/30033564
/**
 * @param latLngInDeg array of arrays with latitude and longtitude
 *   pairs in degrees. e.g. [[latitude1, longtitude1], [latitude2
 *   [longtitude2] ...]
 *
 * @return array with the center latitude longtitude pairs in 
 *   degrees.
 */
function rad2degr(rad) { return rad * 180 / Math.PI; }
function degr2rad(degr) { return degr * Math.PI / 180; }

function getLatLngCenter(latLngInDegr) {
  var LATIDX = 0;
  var LNGIDX = 1;
  var sumX = 0;
  var sumY = 0;
  var sumZ = 0;

  for (var i=0; i<latLngInDegr.length; i++) {
      var lat = degr2rad(latLngInDegr[i][LATIDX]);
      var lng = degr2rad(latLngInDegr[i][LNGIDX]);
      // sum of cartesian coordinates
      sumX += Math.cos(lat) * Math.cos(lng);
      sumY += Math.cos(lat) * Math.sin(lng);
      sumZ += Math.sin(lat);
  }

  var avgX = sumX / latLngInDegr.length;
  var avgY = sumY / latLngInDegr.length;
  var avgZ = sumZ / latLngInDegr.length;

  // convert average x, y, z coordinate to latitude and longtitude
  var lng = Math.atan2(avgY, avgX);
  var hyp = Math.sqrt(avgX * avgX + avgY * avgY);
  var lat = Math.atan2(avgZ, hyp);

  return ([rad2degr(lat), rad2degr(lng)]);
}

function loadScript(file) {
  return new Promise(function(resolve, reject) {
    const script = document.createElement('script');
    script.async = true;
    script.src = '/js/' + file;
    script.onload = resolve;
    script.onerror = reject;
    if (document.head.lastChild.src !== script.src) {
      document.head.appendChild(script);
    }
    else {
      resolve();
    }
  })
}
// Find nearest brewery
function findSuccess(position) {
  // Create overlay with loader as upcoming task may take a while
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  const loader = document.createElement('div');
  loader.className = 'loader';
  overlay.appendChild(loader);
  document.body.appendChild(overlay);

  // Get data
  fetch('/index.json')
  .then(function(blob) {
    return blob.json();
  })
  .then(function(data) {
    let minimumDistance = 100000;
    let url = '/';
    data.forEach(function(entry) {
      const result = distance(
        position.coords.latitude,
        position.coords.longitude,
        parseFloat(entry.lat),
        parseFloat(entry.lon)
      );
      if (result < minimumDistance) {
        minimumDistance = result;
        url = entry.url;
      }
    });
    // Don't forget to clean up
    overlay.parentNode.removeChild(overlay);
    
    // Show alert and redirect
    if (window.location.pathname != url) {
      alert('Next brewery is only ' + minimumDistance.toFixed(1) + ' km away from you. You will be redirected.');
      window.location = url;
    }
    else {
      alert('Great, you are already on the right page. Brewery is only ' + minimumDistance.toFixed(1) + ' km away from you.');
    }
  });
}

function geolocationError(error) {
  let message = 'Location query not successful.';
  switch(error.code) {
    case error.PERMISSION_DENIED:
      message = 'User refused the geolocation request.';
      break;
    case error.POSITION_UNAVAILABLE:
      message = 'Location information not available.';
      break;
    case error.TIMEOUT:
      message = 'Timeout for user location request.';
      break;
    case error.UNKNOWN_ERROR:
      message = 'An unknown error occurred.';
      break;
  }
  alert(message);
}

function geolocationAlert() {
  alert('Geolocation is not supported by your browser.');
}

const findButton = document.getElementById('find-btn');
if (findButton) {
  findButton.onclick = function () {
    if (navigator.geolocation) {
      // We might need permission for this
      navigator.geolocation.getCurrentPosition(findSuccess, geolocationError);
    }
    else {
      geolocationAlert();
    }
  };
}
// Filter input
function startFilter() {
  const regex = new RegExp(this.value, 'gi');
  const entries = Array.from(document.querySelectorAll('li'));
  entries.forEach(function(entry) {
    entry.style.display = regex.test(entry.textContent) ? 'list-item' : 'none';
  });
}
const input = document.querySelector('input');
if (input) {
  input.addEventListener('keyup', startFilter);
  input.addEventListener('keypress', function(event) {
    if (event.keyCode === 13) {
      event.preventDefault();
    }
  });
}
// Map
// multiple markers with clickable popups
// via http://harrywood.co.uk/maps/examples/openlayers/marker-popups.view.html
function buildMap() {
  function createLonLat(longitude, latitude) {
    return new OpenLayers.LonLat(longitude, latitude).transform(epsg4326, projectTo);
  }
  
  function createGeometryPoint(longitude, latitude) {
    return new OpenLayers.Geometry.Point(longitude, latitude).transform(epsg4326, projectTo);
  }
  
  const map = new OpenLayers.Map('map');
  map.addLayer(new OpenLayers.Layer.OSM());
  const vectorLayer = new OpenLayers.Layer.Vector('Overlay');
  map.addLayer(vectorLayer);

  const epsg4326 = new OpenLayers.Projection('EPSG:4326'); // WGS 1984 projection
  const projectTo = map.getProjectionObject(); // The map projection (Spherical Mercator)

  const array = [];
  const locations = Array.from(document.querySelectorAll('li > a[data-lat]'));
  locations.forEach(function(location) {
    array.push([location.dataset.lat, location.dataset.lon]);

    // Define markers as "features" of the vector layer:
    const feature = new OpenLayers.Feature.Vector(
      createGeometryPoint(location.dataset.lon, location.dataset.lat),
      {
        description: '<a href="' + location.href + '">' + location.textContent + '</a>'
      },
      {
        externalGraphic: '/img/marker.png',
        graphicHeight: 42,
        graphicWidth: 42,
        graphicXOffset: -21,
        graphicYOffset: -42
      }
    );
    vectorLayer.addFeatures(feature);
  });
  // Determine map center
  const center = getLatLngCenter(array);  
  map.setCenter(createLonLat(center[1], center[0]), array.length === 1 ? 16 : 2);

  // Add a selector control to the vectorLayer with popup functions
  const controls = {
    selector: new OpenLayers.Control.SelectFeature(vectorLayer, { onSelect: createPopup, onUnselect: destroyPopup })
  };

  function createPopup(feature) {
    feature.popup = new OpenLayers.Popup.FramedCloud('pop',
      feature.geometry.getBounds().getCenterLonLat(),
      null,
      feature.attributes.description,
      null,
      true,
      function() {
        controls['selector'].unselectAll();
      }
    );
    //feature.popup.closeOnMove = true;
    map.addPopup(feature.popup);
  }
  
  function destroyPopup(feature) {
    feature.popup.destroy();
    feature.popup = null;
  }

  map.addControl(controls['selector']);
  controls['selector'].activate();

  // Locate user position
  function locateSuccess(position) {
    const longitude = position.coords.longitude;
    const latitude = position.coords.latitude;
    const lonLat = createLonLat(longitude, latitude);
    if (first) {
      // Create (new) marker for user location
      userFeature = new OpenLayers.Feature.Vector(
        createGeometryPoint(longitude, latitude),
        {
          description: 'My location'
        },
        {
          externalGraphic: '/js/img/marker.png',
          graphicHeight: 25,
          graphicWidth: 21,
          graphicXOffset: -10,
          graphicYOffset: -25
        }
      );
      vectorLayer.addFeatures(userFeature);

      // and center map
      map.setCenter(lonLat, 16);
      first = false;
    }
    else {
      // Move feature to new position
      userFeature.move(lonLat);
    }
    // Set button
    locateButton.classList.add('tracking');
    locateButton.textContent = 'Stop tracking';
  }
  let userFeature;
  let first = true;
  let watchID;
  const locateButton = document.getElementById('locate-btn');
  locateButton.onclick = function () {
    if (navigator.geolocation) {
      if (!this.classList.contains('tracking')) {
        watchID = navigator.geolocation.watchPosition(locateSuccess, geolocationError, { enableHighAccuracy: true });
      }
      else {
        navigator.geolocation.clearWatch(watchID);
        this.classList.remove('tracking');
        this.textContent = 'Track location';
        centering = true;
      }
    }
    else {
      geolocationAlert();
    }
  }
}
const mapButton = document.querySelector('#map button');
if (mapButton) {
  mapButton.onclick = function () {
    loadScript('OpenLayers.js')
    .then(function() {
      buildMap();

      // and hide buttons and overlay
      mapButton.style.display = 'none';
      const parent = mapButton.parentNode;  
      parent.children[1].style.display = 'none';
      parent.classList.remove('is-overlay');

      // Dont forget to show locate button
      parent.children[2].style.display = 'inline-block';
    });
  };
}
