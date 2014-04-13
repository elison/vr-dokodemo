/**
 * @author troffmo5 / http://github.com/troffmo5
 *
 * Google Street View viewer for the Oculus Rift
 */

// Parameters
// ----------------------------------------------
var QUALITY = 3;
var DEFAULT_LOCATION = { lat: 34.072193, lng: -118.442164 };
var CURRENT_LOCATION = DEFAULT_LOCATION;
var NEXT_LOCATION = [ {lat:34.072242, lng:-118.439619}, 
                      {lat:34.086148, lng:-118.454349},
                      {lat:34.072242, lng:-118.439619},
                      {lat:34.072193, lng:-118.442164},
                      {lat:33.598689, lng:-117.882881}];
var LOCATION_NUM = 0;
var MAX_LOCATIONS = NEXT_LOCATION.length;
var USE_TRACKER = false;
var MOVING_MOUSE = false;
var MOUSE_SPEED = 0.005;
var KEYBOARD_SPEED = 0.02;
var SHOW_SETTINGS = true;
var NAV_DELTA = 45;
var OculusRift = {
  // Parameters from the Oculus Rift DK1
  hResolution: 1280,
  vResolution: 800,
  hScreenSize: 0.14976,
  vScreenSize: 0.0936,
  interpupillaryDistance: 0.064,
  lensSeparationDistance: 0.064,
  eyeToScreenDistance: 0.041,
  distortionK : [1.0, 0.22, 0.24, 0.0]
};

// Globals
// ----------------------------------------------
var WIDTH, HEIGHT;

var currHeading = 0;
var centerHeading = 0;
var mouseMoved = false;
var navList = [];

var headingVector = new THREE.Vector3();
var moveVector = new THREE.Vector3();
var HMDRotation = new THREE.Quaternion();
var BaseRotation = new THREE.Quaternion();
var BaseRotationEuler = new THREE.Vector3();

var renderer, projSphere;
var hyperlapse;
var vr_state;
vr.load(function(error) {
  vr_state = new vr.State();
});

gPlayCommand = "play";
gTeleportCommand = "go";
gStopCommand = "stop";
gYelpCommand = "yelp";

// Utility function
function angleRangeDeg(angle) {
  while (angle >= 360) angle -=360;
  while (angle < 0) angle +=360;
  return angle;
}

function angleRangeRad(angle) {
  while (angle > Math.PI) angle -= 2*Math.PI;
  while (angle <= -Math.PI) angle += 2*Math.PI;
  return angle;
}

function deltaAngleDeg(a,b) {
  return Math.min(360-(Math.abs(a-b)%360),Math.abs(a-b)%360);
}

function deltaAngleRas(a,b) {
  // todo
}

function updateCameraRotation() {
  camera.quaternion.multiplyQuaternions(BaseRotation, HMDRotation);
  headingVector.setEulerFromQuaternion(camera.quaternion, 'YZX');
  currHeading = angleRangeDeg(THREE.Math.radToDeg(-headingVector.y));
  //console.log('HEAD', currHeading);
}

// Add a startsWith function to String() objects.
String.prototype.startsWith = function(str)
{
    return(data.substr(0, str.length) === str);
}


// Case insensitive version of the above.
String.prototype.startsWithI = function(str)
{
    return(this.toUpperCase().substr(0, str.length) === str.toUpperCase());
}

function initWebGL() {
  // create scene
  scene = new THREE.Scene();

  // Create camera
  camera = new THREE.PerspectiveCamera( 60, WIDTH/HEIGHT, 1, 1100 );
  camera.target = new THREE.Vector3( 1, 0, 0 );
  camera.useQuaternion = true;
  scene.add( camera );

  // Add projection sphere
  projSphere = new THREE.Mesh( new THREE.SphereGeometry( 500, 60, 40 ), new THREE.MeshBasicMaterial({ map: THREE.ImageUtils.loadTexture('placeholder.png'), side: THREE.DoubleSide}) );
  projSphere.useQuaternion = true;
  scene.add( projSphere );

  // Add Progress Bar
  progBarContainer = new THREE.Mesh( new THREE.CubeGeometry(120,20,10), new THREE.MeshBasicMaterial({color: 0xaaaaaa}));
  progBarContainer.translateZ(-300);
  camera.add( progBarContainer );

  progBar = new THREE.Mesh( new THREE.CubeGeometry(100,10,10), new THREE.MeshBasicMaterial({color: 0x0000ff}));
  progBar.translateZ(10);
  progBarContainer.add(progBar);

  // Create render
  try {
    renderer = new THREE.WebGLRenderer();
  }
  catch(e){
    alert('This application needs WebGL enabled!');
    return false;
  }

  renderer.autoClearColor = false;
  renderer.setSize( WIDTH, HEIGHT );

  // Add stereo effect
  OculusRift.hResolution = WIDTH, OculusRift.vResolution = HEIGHT,

  // Add stereo effect
  effect = new THREE.OculusRiftEffect( renderer, {HMD:OculusRift} );
  effect.setSize(WIDTH, HEIGHT );

  var viewer = $('#viewer');
  viewer.append(renderer.domElement);
}

function initControls(){
  var lastSpaceKeyTime = new Date();
  var lastCtrlKeyTime = new Date();
  $(document).keydown(function(e) {
    switch(e.keyCode) {
      case 32:
        var spaceKeyTime = new Date();
        if (spaceKeyTime-lastSpaceKeyTime < 300) {
          $('#mapcontainer').toggle(200);
          $('#settings').toggle(200);
        }
        lastSpaceKeyTime = spaceKeyTime;
        break;
      case 37:
        moveVector.y = KEYBOARD_SPEED;
        break;
      case 38:
        moveVector.x = KEYBOARD_SPEED;
        break;
      case 39:
        moveVector.y = -KEYBOARD_SPEED;
        break;
      case 40:
        moveVector.x = -KEYBOARD_SPEED;
        break;
      case 17:
        var ctrlKeyTime = new Date();
        if (ctrlKeyTime-lastCtrlKeyTime < 300) {
          moveToNextPlace();
        }
        lastCtrlKeyTime = ctrlKeyTime;
        break;
    }
  });

  $(document).keyup(function(e) {
    switch(e.keyCode) {
      case 37:
      case 39:
        moveVector.y = 0.0;
        break;
      case 38:
      case 40:
        moveVector.x = 0.0;
        break;
    }
  });
  var viewer = $('#viewer');
  viewer.dblclick(function() {
    moveToNextPlace();
  });
  
  viewer.mousedown(function(event) {
    MOVING_MOUSE = !USE_TRACKER;
    lastClientX = event.clientX;
    lastClientY = event.clientY;
  });

  viewer.mouseup(function() {
    MOVING_MOUSE = false;
  });

  lastClientX = 0; lastClientY = 0;
  viewer.mousemove(function(event) {
    if (MOVING_MOUSE) {
      BaseRotationEuler.set(
        angleRangeRad(BaseRotationEuler.x + (event.clientY - lastClientY) * MOUSE_SPEED),
        angleRangeRad(BaseRotationEuler.y + (event.clientX - lastClientX) * MOUSE_SPEED),
        0.0
      );
      lastClientX = event.clientX;lastClientY =event.clientY;
      BaseRotation.setFromEuler(BaseRotationEuler, 'YZX');

      updateCameraRotation();
    }
  });

  if (!SHOW_SETTINGS) {
    $('#mapcontainer').hide();
    $('#settings').hide();
  }

  window.addEventListener( 'resize', resize, false );

}

function initLeap()
{
  var leap = new LL();
  leap.onSwipeRight = function(e){
    console.log(e);
    console.log("move next");
    moveToNextPlace();
  };
  leap.onSwipeLeft = function(e){
    console.log(e);
  };
  leap.onSwipeUp = function(e){
    console.log(e);
  };
  leap.onSwipeDown = function(e){
    console.log(e);
  };
  leap.onCircle = function(e){
    console.log(e);
  };
  leap.onKeyTap = function(e){
    console.log(e);
  };

}

function initPano() {
  panoLoader = new GSVPANO.PanoLoader();
  panoLoader.setZoom(QUALITY);

  panoLoader.onProgress = function( progress ) {
    if (progress > 0) {
      progBar.visible = true;
      progBar.scale = new THREE.Vector3(progress/100.0,1,1);
    }
  };
  panoLoader.onPanoramaData = function( result ) {
    progBarContainer.visible = true;
    progBar.visible = false;
  };

  panoLoader.onNoPanoramaData = function( status ) {
    //alert('no data!');
  };

  panoLoader.onPanoramaLoad = function() {
    var a = THREE.Math.degToRad(90 - panoLoader.heading);
    projSphere.quaternion.setFromEuler(new THREE.Vector3(0,a,0), 'YZX');

    projSphere.material.wireframe = false;
    projSphere.material.map.needsUpdate = true;
    projSphere.material.map = new THREE.Texture( this.canvas );
    projSphere.material.map.needsUpdate = true;
    centerHeading = panoLoader.heading;

    progBarContainer.visible = false;
    progBar.visible = false;

    marker.setMap( null );
    marker = new google.maps.Marker({ position: this.location.latLng, map: gmap });
    marker.setMap( gmap );

    /*
    if (window.history) {
      var newUrl = '/oculusstreetview/?lat='+this.location.latLng.lat()+'&lng='+this.location.latLng.lng();
      newUrl += '&q='+QUALITY;
      newUrl += '&s='+$('#settings').is(':visible');
      newUrl += '&heading='+currHeading;
      window.history.pushState('','',newUrl);
    }
    */
  };
}

function initGoogleMap() {
  currentLocation = new google.maps.LatLng( DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng );
  gmap = new google.maps.Map(document.getElementById("map"), {
    zoom: 14,
    center: currentLocation,
    mapTypeId: google.maps.MapTypeId.HYBRID,
    streetViewControl: true
  });

  google.maps.event.addListener(gmap, 'click', function(event) {
    panoLoader.load(event.latLng);
  });

  geocoder = new google.maps.Geocoder();

  $('#mapsearch').change(function() {
      geocoder.geocode( { 'address': $('#mapsearch').val()}, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) {
        gmap.setCenter(results[0].geometry.location);
        panoLoader.load( results[0].geometry.location );
      }
    });
  });

  marker = new google.maps.Marker({ position: currentLocation, map: gmap });
  marker.setMap( gmap );

  gmap2 = new google.maps.Map(document.getElementById("map2"), {
    zoom: 14,
    center: currentLocation,
    mapTypeId: google.maps.MapTypeId.HYBRID,
    streetViewControl: true
  });
  
  google.maps.event.addListener(gmap2, 'click', function(event) {
    panoLoader.load(event.latLng);
  });

  geocoder = new google.maps.Geocoder();

  $('#mapsearch2').change(function() {
      geocoder.geocode( { 'address': $('#mapsearch2').val()}, function(results, status) {
      if (status == google.maps.GeocoderStatus.OK) {
        gmap2.setCenter(results[0].geometry.location);
        panoLoader.load( results[0].geometry.location );
      }
    });
  });

  marker2 = new google.maps.Marker({ position: currentLocation, map: gmap2 });
  marker2.setMap( gmap2 );
}


function moveToNextPlace() {
  var nextPoint = null;
  var minDelta = 360;
  var navList = panoLoader.links;
  for (var i = 0; i < navList.length; i++) {
    var delta = deltaAngleDeg(currHeading, navList[i].heading);
    if (delta < minDelta && delta < NAV_DELTA) {
      minDelta = delta;
      nextPoint = navList[i].pano;
    }
  }

  if (nextPoint) {
    panoLoader.load(nextPoint);
  }
}

function render() {
  effect.render( scene, camera );
  //renderer.render(scene, camera);
}

function resize( event ) {
  WIDTH = window.innerWidth;
  HEIGHT = window.innerHeight;

  OculusRift.hResolution = WIDTH,
  OculusRift.vResolution = HEIGHT,
  effect.setHMD(OculusRift);

  renderer.setSize( WIDTH, HEIGHT );
  camera.projectionMatrix.makePerspective( 60, WIDTH /HEIGHT, 1, 1100 );
}

function loop() {
  requestAnimationFrame( loop );

  // check HMD
  vr.pollState(vr_state);
  if (vr_state.hmd.present) {
    HMDRotation.set(
      vr_state.hmd.rotation[0],
      vr_state.hmd.rotation[1],
      vr_state.hmd.rotation[2],
      vr_state.hmd.rotation[3]);
  }
  updateCameraRotation();

  // render
  render();
}

function getParams() {
  var params = {};
  var items = window.location.search.substring(1).split("&");
  for (var i=0;i<items.length;i++) {
    var kvpair = items[i].split("=");
    params[kvpair[0]] = unescape(kvpair[1]);
  }
  return params;
}

function initHyperlapse(finalDestination)
{
    hyperlapse = new Hyperlapse(renderer, projSphere, {
      lookat: new google.maps.LatLng(finalDestination.lat,finalDestination.lng),

      zoom: 1,
      use_lookat: true,
      elevation: 50
    });

    hyperlapse.onError = function(e) {
      console.log(e);
    };

    hyperlapse.onFrame = function(e) {
      for(var i = 0; i < 230000; i++);
    }

    hyperlapse.onRouteComplete = function(e) {
      console.log("ROUTE COMPLETE");
      hyperlapse.load();
    };

    hyperlapse.onLoadComplete = function(e) {
      console.log(" onLoadComplete");
      hyperlapse.play();
    };
}




function startTimelapse(currentLocation, finalDestination) //huehuehuehuehue
{
  console.log("start time lapse");
  hyperlapse.setLookat(finalDestination);
  hyperlapse.reset();

  // Google Maps API stuff here...
  var directions_service = new google.maps.DirectionsService();

  var route = {
    request:{
      origin: new google.maps.LatLng(currentLocation.lat,currentLocation.lng),
      destination: new google.maps.LatLng(finalDestination.lat,finalDestination.lng),
      travelMode: google.maps.DirectionsTravelMode.DRIVING
    }
  };

  directions_service.route(route.request, function(response, status) {
    if (status == google.maps.DirectionsStatus.OK) {
      CURRENT_LOCATION = finalDestination;
      console.log(LOCATION_NUM);
      LOCATION_NUM++;
      hyperlapse.generate( {route:response} );
    } else {
      console.log(status);
    }
  });
}


function initVoice()
{
  console.log("init voice");
  $('#tags').on('webkitspeechchange', function(e) {
      
      var phrase = $('#tags').val();
      $('#tags2').val( $('#tags').val());
      console.log($('#tags').val());
       // Play Music
        if (phrase.startsWithI(gPlayCommand))
        {
          apiswf.rdio_play($('#play_key').val());
        }
        // Teleport!
        else if (phrase.startsWithI(gTeleportCommand)) {
          //alert("teleporting to " + phrase.substr(6, phrase.length));
          var geocoder = new google.maps.Geocoder();
          var address = phrase.substr(6, phrase.length);
          //get the lat and long 
          geocoder.geocode( {'address': address}, function(results, status){
              console.log(status);
              //teleport and move map
              panoLoader.onNoPanoramaData = function(e){
                  console.log('hit no panorama data');
                  gmap.panTo(new google.maps.LatLng(CURRENT_LOCATION.lat, CURRENT_LOCATION.lng));
                  gmap2.panTo(new google.maps.LatLng(CURRENT_LOCATION.lat, CURRENT_LOCATION.lng));
              }
              if (panoLoader.load( new google.maps.LatLng( results[0].geometry.location.k, results[0].geometry.location.A) ))
                {
                  gmap.panTo(new google.maps.LatLng(results[0].geometry.location.k, results[0].geometry.location.A));
                  gmap2.panTo(new google.maps.LatLng(results[0].geometry.location.k, results[0].geometry.location.A));
                  CURRENT_LOCATION.lat = results[0].geometry.location.k;
                  CURRENT_LOCATION.lng = results[0].geometry.location.A;
                }
           });
        }
        // Stop Music
        else if (phrase.startsWithI(gStopCommand))
        {
          apiswf.rdio_stop();
        }
        // Yelp Stuff
        else if (phrase.startsWithI(gYelpCommand))
        {
          getYelpResults();
        }
        else
        {
        }
  });
}


$(document).ready(function() {

  // Read parameters
  params = getParams();
  if (params.lat !== undefined) DEFAULT_LOCATION.lat = params.lat;
  if (params.lng !== undefined) DEFAULT_LOCATION.lng = params.lng;
  if (params.q !== undefined) QUALITY = params.q;
  if (params.s !== undefined) SHOW_SETTINGS = params.s !== "false";
  if (params.heading !== undefined) {
    BaseRotationEuler.set(0.0, angleRangeRad(THREE.Math.degToRad(-parseFloat(params.heading))) , 0.0 );
    BaseRotation.setFromEuler(BaseRotationEuler, 'YZX');
  }


  WIDTH = window.innerWidth; HEIGHT = window.innerHeight;
  
  initWebGL();

  initControls();
  initLeap();
  initPano();
  initHyperlapse(NEXT_LOCATION[LOCATION_NUM]);
  initGoogleMap();
  initVoice();

  $(document).keydown(function(e){
    if(LOCATION_NUM < MAX_LOCATIONS){
      switch(e.keyCode) {
        case 90: //90 is z
          
          startTimelapse(CURRENT_LOCATION, NEXT_LOCATION[LOCATION_NUM]);
          break;
      }
    }
  });
  console.log('ok');

  
  // Load default location
  panoLoader.load( new google.maps.LatLng( DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng ) );

  loop();
});
