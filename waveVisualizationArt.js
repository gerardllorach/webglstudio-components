// Code for wave visualization (inside WebGLStudio). This is not a WebGLStudio component.
// Interesting code starts at line 156
// Demo can be found in https://webglstudio.org/users/gerard/audioVis/
//
// Gerard Llorach
//

// Globals
if (!LS.Globals)
  LS.Globals = {};

// Audio context
if (!LS.Globals.AContext)
  LS.Globals.AContext = new AudioContext();

this.bufferSize = 200;


this.onStart = function(){
  var context = this._context = LS.Globals.AContext;
	// Sound source
  this._sample = context.createBufferSource();
  // Gain Node
  this._gainNode = context.createGain();
  // Analyser
  this._analyser = context.createAnalyser();
  // FFT size
  this._analyser.fftSize = 2048;
  // FFT smoothing
  this._analyser.smoothingTimeConstant = 0.8;
  
  // Wave buffer
  this._data = new Float32Array(this._analyser.frequencyBinCount);
  
  // Waves arrays
  this._waves = [];
}


this.onUpdate = function(){
  this._analyser.getFloatTimeDomainData(this._data);
  var wave = this._data;
  
  if (this._waves.length < this.bufferSize)
  	this._waves.push(new Float32Array(wave));
  else {
    this._waves.shift();
    this._waves.push(new Float32Array(wave));
  }
}



this.playSample = function(){
  
  // Sample to analyzer
  this._sample.connect (this._analyser);
  // Analyzer to Gain
  this._analyser.connect(this._gainNode);
  // Gain to Hardware
  this._gainNode.connect(this._context.destination);
  // Volume
  //this.gainNode.gain.value = 1;
  //this.gainNode.setTargetAtTime(1, 0, 0);
  
  
  that = this;
  
  this._sample.onended = function(){that.working = false; console.log("Audio ended playing.")};
  // start
  this._sample.start(0);

}

// DRAG AND DROP - audio files
this.onFileDrop = function(data) {

  var that = this;
  file = data.file;

  var reader = new FileReader();
  
  console.log("Dropped audio file: " + file.name);
  reader.onload = function(e)
  {
    console.log("Reading...");
    var filedata = e.target.result;
    LS.Globals.AContext.decodeAudioData(filedata, function(buffer) {
      that.loadBuffer(buffer);
		});
  };
  reader.readAsArrayBuffer(file)
  
  return false;
}

// For drag and drop files
this.loadBuffer = function(buffer){

  console.log("Loading buffer");
  this._sample = LS.Globals.AContext.createBufferSource();
  this._sample.buffer = buffer;

  this.playSample();
}







this.heightWave = 300;
this.averaging = true;
this.temporalResize = 1.0;
this.alphaMax = 0.8;


this.onRenderGUI = function()
{

  if (LS.GlobalScene.state == 0)
    return;

  var width = gl.viewport_data[2];
  var height = gl.viewport_data[3];
  
  // GUI
  LS.GUI.Label( [10,10,100,20], "Vertical scale" );
  this.heightWave = LS.GUI.HorizontalSlider( [10, 30, 100, 20], this.heightWave, 50, height, true );
  this.averaging = LS.GUI.Toggle( [50,60,65,20], this.averaging, "Averaging" );
  LS.GUI.Label( [10,90,100,20], "Temporal resize" );
  this.temporalResize = LS.GUI.HorizontalSlider( [10, 120, 100, 20], this.temporalResize, 0.9, 1.1, true );
  LS.GUI.Label( [10,150,100,20], "Alpha" );
  this.alphaMax = LS.GUI.HorizontalSlider( [10, 180, 100, 20], this.alphaMax, 0.31, 1, true );
  LS.GUI.Label( [10,210,100,20], "Buffer size" );
  this.bufferSize = LS.GUI.HorizontalSlider( [10, 240, 100, 20], this.bufferSize, 2, 500, true );
  
  
  
  // Buttons
  if( LS.GUI.Button( [150,10,100,20], "Reset buffer" ) ){
    this._waves = [];
    return;
  }
  if( LS.GUI.Button( [150,30,100,20], "Stop sound" ) ){
    if(this._sample)
    	if(this._sample.buffer)
      	this._sample.stop(0);
    return;
  }

  
  
  var ctx = gl;
  ctx.start2D();
  

  
	var widthWave = width*0.8;
  var heightWave = this.heightWave;
  
  for (var i = 0; i<this._waves.length-1; i++){
    
    // Start painting soft, then go to stronger colors
    var rangeAlpha = [0.3, this.alphaMax];
    ctx.strokeStyle = "rgba(173, 238, 255,"+ (i/this.bufferSize)*(rangeAlpha[1]-rangeAlpha[0])+rangeAlpha[0] +")";
    
    var wave = this._waves[i];
    // Iterate wave
    ctx.beginPath();
    ctx.moveTo(width-widthWave,height/2);
    for (var j = 0; j<wave.length; j++){
      var xP = (width-widthWave)*0.5 + widthWave*j/wave.length;
      
      var valueWave = wave[j];
      var softenEdge = 0.25;
      valueWave *= Math.min(j/(softenEdge*wave.length), 1); // Soften edges
      valueWave *= Math.min(1, (wave.length-j)/(softenEdge*wave.length));
      
      var yP = heightWave*valueWave + height/2;
      
      
      if (this.averaging)
      	wave[j] = this.temporalResize*(wave[j] + this._waves[i+1][j])*0.5;
      else
        wave[j] *= this.temporalResize;
        

    	ctx.lineTo(xP, yP); 
    }
    ctx.closePath();
    ctx.stroke();
    
  }
  
  ctx.finish2D();
}
