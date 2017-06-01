// Natural Neighbour Interpolation
// Visual implementation: http://webglstudio.org/gerard/nni/
// Idea from: http://alexbeutel.com/webgl/voronoi.html
// Paper:
//  Kenneth E. Hoff, III, John Keyser, Ming Lin, Dinesh Manocha, and Tim Culver. 1999. 
//  Fast computation of generalized Voronoi diagrams using graphics hardware. 
//  In Proceedings of the 26th annual conference on Computer graphics and interactive techniques (SIGGRAPH '99)

// Important functions are:
// addPoint(x,y); returns a coneNode. -- adds a new voronoi point. Removes NNI point if necessary. It's name is the id used for weights
// initNNI(x,y);addNNIPoint(x,y) -- starts interpolation
// movePoint(id, x,y); -- moves a point. id is the hex color or name of the cone node
// moveNNIPoint(x,y); -- moves the averaging point. It creates a new averaging point if non existant.
// removeNNIPoint(); -- removes the averaging point and renders the frame without it (voronoi diagram)
// getWeights(); -- returns this.conesW, an object with the percentatges for each point. keys are hex colors i.e. coneNode names



function NNI(o) {
  //define some properties
	this._camJSON = '{"object_class":"Camera","layers":12,"enabled":true,"type":2,"eye":[0,0,0],"center":[0,-13,0],"up":[0,1,0],"near":0.1,"far":10000,"fov":45,"aspect":1,"orthographic":[-1,1,-1,1],"background_color":[0,0,0,1],"frustum_size":10,"viewport":[0,0,1,1],"render_to_texture":true,"frame":{"width":64,"height":64,"filter_texture":false,"precision":0,"format":6408,"adjust_aspect":false,"use_depth_texture":false,"use_stencil_buffer":false,"num_extra_textures":0,"clone_after_unbind":false,"name":null},"show_frame":true}'
  
  // Create cone mesh (radius, height, segments, in_z, use_global )
  this._geoCone = '{ "size": 15, "subdivisions": 40, "align_z": false, "primitive": -1, "geometry": 8}';

  // Pixels
  this._pixels = null;
  this._NNIPixels = null;
  // Cones
  this.conesW = {};
  this.cones = {}; // For painting points;
  // Target average
  this._startNNI = false;
	this._NNIUid = null;
  
  // Create cam node
  this._nodeCam = new LS.SceneNode();
  
  this.createProperty("frameSize", "yes", {type: "number", widget:"combo", values:[32, 64, 128, 256, 512, 1024]});
	this.frameSize = 64;
  
  // Render GUI
  this.showGUI = false;
  this._texture = null;
  
  
  //if we have the state passed, then we restore the state
  if(o)
    this.configure(o);
}

//bind events when the component belongs to the scene
NNI.prototype.onAddedToScene = function(scene)
{
  LEvent.bind(scene, "beforeRender", this.onSceneRender, this );
  LEvent.bind(scene, "afterRenderInstances", this.onAfterRender, this );
  LEvent.bind(scene, "start", this.onStart, this ); // START
  LEvent.bind(scene, "finish", this.onFinish, this ); // STOP -> REMOVE CAMERA AND CONES
  
  LEvent.bind(scene, "renderGUI", this.onRenderGUI, this );
}

//unbind events when the component no longer belongs to the scene
NNI.prototype.onRemovedFromScene = function(scene)
{
	//unbind events
  LEvent.unbind(scene, "beforeRender", this.onSceneRender, this );
  LEvent.unbind(scene, "afterRenderInstances", this.onAfterRender, this );
  LEvent.unbind(scene, "start", this.onStart, this ); // START
  LEvent.unbind(scene, "finish", this.onFinish, this ); // STOP -> REMOVE CAMERA AND CONES
  
  LEvent.unbind(scene, "renderGUI", this.onRenderGUI, this );
}


// Before render
NNI.prototype.onSceneRender = function(){
  // New averaging point. Store voronoi pixels and add averaging cone
  if (this._startNNI){
    // First store the pixels
  	this._pixels = this._camOrth._frame.getColorTexture().getPixels();
  	// Add a new cone for NNI
  	var coneNNI = this.addPoint(this._targetNNI[0],this._targetNNI[1], 0.5);
  }

}

// Create camera and add to scene
NNI.prototype.onStart = function()
{
  // Create orthogonal camera
  if (!this._camOrth){
    // Create orthogonal camera
    this._camOrth = new LS.Camera();
    var conf = JSON.parse(this._camJSON);
    // FrameSize
    conf.frame.width = this.frameSize;
    conf.frame.height = this.frameSize;
    // Configure camera
    this._camOrth.configure(conf);
    // Create node and add camera
    this._nodeCam.addComponent(this._camOrth);
    this._nodeCam.transform.rotateX(0.001); // Something is wrong with the center
    this._nodeCam.name = "NNICamera";
    this.parentNode.addChild(this._nodeCam);
	}
  // Reset this.conesW weights
  var keys = Object.keys(this.conesW);
  for (var i = 0; i< keys.length; i++)
    delete this.conesW[keys[i]];
}

// Remove camera and cones
NNI.prototype.onFinish = function()
{
  // Remove camera
  if (this._nodeCam){
    var parent = this._nodeCam.parentNode;
    parent.removeChild(this._nodeCam);
  }
  // Remove cones
  var keys = Object.keys(this.cones);
  for (var i = 0; i< keys.length; i++){
    parent = this.cones[keys[i]].parentNode;
    parent.removeChild(this.cones[keys[i]]);
  }
  
}


// Script called when scene render finished
NNI.prototype.onAfterRender = function(){
  if (!this._camOrth){
    return;
  }
  
  // GUI texture
  if (this.showGUI)
    this._texture = this._camOrth._frame.getColorTexture();
  
  
  if (!this._computeAverage){
    // Deactivate camera
  	this._camOrth.enabled = false;
    return;
  }
  
  
  if (this._startNNI)
    this._startNNI = false;
  
  // Get the new pixels
  this._NNIPixels = this._camOrth._frame.getColorTexture().getPixels();
  // Compute differences
  // Pixels indx
  var pixelsIndx = [];
  var p = this._pixels;
  var np = this._NNIPixels;
  // Check differences between pixels without the new averaging cone
  for (var i = 0; i < this._pixels.length/4; i++){
    var ii = i*4;
    var diff = p[ii]-np[ii] + p[ii+1]-np[ii+1] + p[ii+2]-np[ii+2];
    // Store index
    if (diff != 0)
      pixelsIndx.push(i);
  }
  
  // Reset weights
  var keys = Object.keys(this.conesW);
  for (var i = 0; i<keys.length; i++) this.conesW[keys[i]] = 0;
    
  // Compute weights
  for (var i = 0; i<pixelsIndx.length; i++){
    var ii = pixelsIndx[i]*4;
    var id = this.rgb2hex([p[ii], p[ii+1], p[ii+2]], 255);
    //if (this.conesW[id] !== undefined)
    	this.conesW[id] += 1;
  }
  
  // Normalize weights
  for (var i = 0; i<keys.length; i++) this.conesW[keys[i]] /= pixelsIndx.length;
  
  // Stop computing average if no changes
  this._computeAverage = false;
  
  // GUI texture
  if (this.showGUI)
    this._texture = this._camOrth._frame.getColorTexture();
  
}



// Create a new point or neighbour of the voronoi diagram. If alpha is defined, it is the averaging point
NNI.prototype.addPoint = function(px, py, alpha){
  // Activate camera to render frame with the new cone
  this._camOrth.enabled = true;
   
  
  // Create material
  // TODO: probably there is a lighter material
  var coneMat = new LS.StandardMaterial();
  // Shadeless
  coneMat.flags.ignore_lights = true;
  // Random color
  coneMat.setProperty("color", [Math.random(),Math.random(),Math.random()]);
  // Opacity if alpha is set (for NNI)
  if (alpha !== undefined){
    coneMat.setProperty("opacity", alpha);
    coneMat.setProperty("blend_mode", "alpha");
    coneMat.setProperty("color", [1,1,1]);
  }
  
  // Create cone component
  var geoConeComp = new LS.Components.GeometricPrimitive();//new LS.Components.MeshRenderer();
  geoConeComp.configure(JSON.parse(this._geoCone));//meshRendererComp.mesh = this._coneMesh;
  
  // Create node
  var coneNode = new LS.SceneNode();
  coneNode.addComponent(geoConeComp);
  coneNode.material = coneMat;
  
  // Set position according to click
  var yPos = geoConeComp.size + 1; // Cone tip below the camera
  coneNode.transform.setPosition((px-0.5)*10, -yPos, (py-0.5)*10);
  coneNode.voronoiPos = [px,py];
  
  // Change layer
  coneNode.setLayer(0, false); // false
  coneNode.setLayer(1, false); // false
  coneNode.setLayer(2, true);
  coneNode.setLayer(3, true);
  
  // Add Node to Scene
  this.root.addChild(coneNode);
  
  // Add to cone arrays. Id is the hex color because we read pixels.
  var id = this.rgb2hex(coneMat.color);
  // Check if id is repeated and generate a new one
  var idRepeated = true;
  while (idRepeated){
    idRepeated = false;
    // Check if repeated
    var keys = Object.keys(this.cones);
    for (var i = 0; i<keys.length; i++){
      if (id == keys[i]){
        idRepeated = true;
        break;
      }
    }
    // Generate new color
    if (idRepeated){
      coneMat.setProperty("color", [Math.random(),Math.random(),Math.random()]);
      id = this.rgb2hex(coneMat.color);
    }
  }
  
  
  // Add weight if cone is not the averaging
  // Remove averaging cone in order to render the frame without it
  if (alpha === undefined){
  	this.conesW[id] = 0;
    this.cones[id] = coneNode;
    // Remove averaging cone
    var NNIcone = this.cones[this._NNIUid];
    if (NNIcone){
    	NNIcone.parentNode.removeChild(NNIcone);
    	delete this.cones[this._NNIUid];
    }
    // Name the cone with the id
    coneNode.name = id;
  } 
  // Activate computing average
  else{
    this.cones[coneNode.uid] = coneNode;
    this._NNIUid = coneNode.uid;
    // Flag for computing the average
  	this._computeAverage = true;
    // Name the NNI cone
    coneNode.name = "NNICone";
  }
  
  // Return node
  return coneNode;
}


// Move existing point
NNI.prototype.movePoint = function(id, px, py){
  // Activate camera
  this._camOrth.enabled = true;
  
  var cone = this.cones[id];
  
  if (!cone)
    return;
  cone.transform.position[0] = (px-0.5)*10;
  cone.transform.position[2] = (py-0.5)*10;
  cone.voronoiPos = [px,py];
  cone.transform.mustUpdate = true;

}

// Should return the last computed conesW.
// The first iteration won't be valid though
NNI.prototype.getWeights = function(){
  return this.conesW;
}



// Init NNI. The result takes one iteration
NNI.prototype.initNNI = NNI.prototype.addNNIPoint = NNI.prototype.moveNNI = function(px, py){
  
  // If averaging cone doesn't exist
  if (!this.cones[this._NNIUid]){
    // Start NNI (store previous pixels and compute averaging)
    this._startNNI = true;
    this._targetNNI = [px,py];
    // Activate camera
    this._camOrth.enabled = true;
  } 
  // Averaging cone exists
  else {
    this._computeAverage = true;
    this.movePoint(this._NNIUid, px, py);
  }
  
}


NNI.prototype.removeNNIPoint = function(px, py){
	var NNICone = this.cones[this._NNIUid];
  NNICone.parentNode.removeChild(NNICone);
  delete this.cones[this._NNIUid];
  // Ensure that the render2texture frame is without the averaging cone
  // Activate camera
    this._camOrth.enabled = true;
}






// If input range is 255 no need to multiply by 255.
NNI.prototype.rgb2hex = function(rgb, range){
  var r = rgb[0];
  var g = rgb[1];
  var b = rgb[2];
  
  if (range != 255){
    // Check if range is from 0-1 and translate to 0-255
    if (r % 1 != 0 || g % 1 != 0 || b % 1 != 0 ||
       (r <1 && g <1 && b <1)){
      r *= 255;
      g *= 255;
      b *= 255;
    }
  }

  r = Math.round(r); g = Math.round(g); b = Math.round(b);
  // RGB to Hex
  return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}




NNI.prototype.onRenderGUI = function(){
  
  if (LS.GlobalScene.state != LS.RUNNING)
    return;
  
  if (!this.showGUI)
    return;
  
  width = w = gl.viewport_data[2];
  height = h = gl.viewport_data[3];
  
  gl.start2D();
  // Get texture from camera
  
  if (this._camOrth){
    if (this._camOrth.enabled){
			this._texture = this._camOrth._frame.getColorTexture();
    }
  }
  var texture = this._texture;
  
  // Texture pos and size
  var posx = 64;
  var posy = 64;
  var size = 128;
  
  
  // Show weights
  var keys = Object.keys(this.conesW);
  // Background rectangle
  gl.fillStyle = "rgba(127,127,127,0.7)";
  gl.fillRect(posx*0.9, posy*0.9, size*1.1, keys.length * 20 + size*1.1);
  
  var lastP = 0;
  for (var i = 0; i<keys.length; i++){
    var text = this.conesW[keys[i]].toFixed(2);

    // TEXT - Paint text and percentage
    gl.strokeStyle = "black";
    gl.font = "15px Arial";
    gl.fillStyle = "rgba(255,255,255,0.8)";
    gl.textAlign = "left";
    gl.fillText(text, posx+25, i*20+8+posy+size*1.1);
    //gl.strokeText(text, 100, i*20+100);

    // LEGEND COLORS - Paint legend of colors
    var c = hexColorToRGBA(keys[i]);
    gl.fillStyle = "rgba(" + c[0]*255 + "," + c[1]*255 + "," + c[2]*255 + ",0.8)";
    gl.fillRect(posx, i*20-5 + posy + size*1.1, 20, 15);
    gl.strokeRect(posx, i*20-5 +posy + size*1.1, 20, 15);
    
    // PERCENTAGE CAKE - Paint cake
    if (this.cones[this._NNIUid]){
      var rad = 70;
      var centerX = posx + size + rad*1.5; var centerY = posy + size/2;
      gl.strokeStyle = "rgba(255,255,255,0.8)";
      gl.lineWidth = 2;
      gl.beginPath();
      gl.moveTo(centerX,centerY);
      gl.arc(centerX,centerY,rad, lastP*2*Math.PI, (this.conesW[keys[i]]+lastP)*2*Math.PI);
      gl.lineTo(centerX, centerY);
      gl.closePath();
      gl.fill();
      gl.stroke();
      lastP += this.conesW[keys[i]];
    }
  }
  
  
  // TEXTURE - Paint texture as image
  if (texture){
    gl.drawImage(texture, posx,posy, size, size);
    // Draw points
    gl.fillStyle = "rgb(0,0,0)";
    var keys = Object.keys(this.cones);
    for (var i = 0; i<keys.length; i++){
      var cone = this.cones[keys[i]];
      gl.fillRect(posx + cone.voronoiPos[0]*size,posy + cone.voronoiPos[1]*size, 2, 2);
    }
  }
  
  
  

  
  gl.finish2D();
  
}



//you can also implement the methods serialize and configure

//register the class so it is a valid component for LS

LS.registerComponent( NNI );