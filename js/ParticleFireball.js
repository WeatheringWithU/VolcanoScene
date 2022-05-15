/**
* @author Lee Stemkoski   http://www.adelphi.edu/~stemkoski/
*/

///////////////////////////////////////////////////////////////////////////////

const particleVertexShader = `
attribute vec3  customColor;
attribute float customOpacity;
attribute float customSize;
attribute float customAngle;
attribute float customVisible;
attribute float blend;
varying vec4  vColor1;
varying float vAngle1;
varying float vBlend;
void main(){
	if ( customVisible > 0.5 )
		vColor1 = vec4( customColor, customOpacity );
	else
		vColor1 = vec4(0.0, 0.0, 0.0, 0.0);
	vAngle1 = customAngle;
	vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
	gl_PointSize = customSize * 0.5;
	gl_Position = projectionMatrix * mvPosition;
	vBlend = blend;
}
`;
	
const particleFragmentShader = `
uniform sampler2D texture1;
varying vec4 vColor1;
varying float vAngle1;
varying float vBlend;
void main(){
	gl_FragColor = vColor1;
	float c = cos(vAngle1);
	float s = sin(vAngle1);
	vec2 rotatedUV = vec2(c * (gl_PointCoord.x - 0.5) + s * (gl_PointCoord.y - 0.5) + 0.5,
						  c * (gl_PointCoord.y - 0.5) - s * (gl_PointCoord.x - 0.5) + 0.5);
	vec4 rotatedTexture = texture( texture1,  rotatedUV );
	gl_FragColor = gl_FragColor * rotatedTexture;
	gl_FragColor.w *= vBlend;
}
`;

///////////////////////////////////////////////////////////////////////////////

///////////////////////////
// PARTICLE ENGINE CLASS //
///////////////////////////

function Change(timeArray, valueArray)
{
	this.times  = timeArray || [];
	this.values = valueArray || [];
}

Change.prototype.lerp = function(t)
{
	var i = 0;
	var n = this.times.length;
	while (i < n && t > this.times[i])  
		i++;
	if (i == 0) return this.values[0];
	if (i == n)	return this.values[n-1];
	var p = (t - this.times[i-1]) / (this.times[i] - this.times[i-1]);
	if (this.values[0] instanceof THREE.Vector3)
		return this.values[i-1].clone().lerp( this.values[i], p );
	else // its a float
		return this.values[i-1] + p * (this.values[i] - this.values[i-1]);
}

///////////////////////////////////////////////////////////////////////////////

////////////////////
// PARTICLE CLASS //
////////////////////

function Particle1()
{
	this.position     = new THREE.Vector3();
	this.velocity     = new THREE.Vector3(); // units per second
	this.acceleration = new THREE.Vector3();

	this.angle             = 0;
	this.angleVelocity     = 0; // degrees per second
	this.angleAcceleration = 0; // degrees per second, per second
	
	this.size = 16.0;

	this.color   = new THREE.Color();
	this.opacity = 1.0;
			
	this.age   = 0;
	this.alive = 0; // use float instead of boolean for shader purposes	
}

Particle1.prototype.update = function(dt)
{
	this.position.add( this.velocity.clone().multiplyScalar(dt) );
	this.velocity.add( this.acceleration.clone().multiplyScalar(dt) );
	
	// convert from degrees to radians: 0.01745329251 = Math.PI/180
	this.angle         += this.angleVelocity     * 0.01745329251 * dt;
	this.angleVelocity += this.angleAcceleration * 0.01745329251 * dt;

	this.age += dt;
	
	// if the Change for a given attribute is nonempty,
	//  then use it to update the attribute's value

	if ( this.sizeChange.times.length > 0 )
		this.size = this.sizeChange.lerp( this.age );
				
	if ( this.colorChange.times.length > 0 )
	{
		var colorHSL = this.colorChange.lerp( this.age );
		this.color = new THREE.Color().setHSL( colorHSL.x, colorHSL.y, colorHSL.z );
	}
	
	if ( this.opacityChange.times.length > 0 )
		this.opacity = this.opacityChange.lerp( this.age );
}
///////////////////////////
// PARTICLE ENGINE CLASS //
///////////////////////////

var Type = Object.freeze({ "CUBE":1, "SPHERE":2 });

function ParticleFireball()
{
	/////////////////////////
	// PARTICLE PROPERTIES //
	/////////////////////////

	this.positionStyle = Type.CUBE;		
	this.positionBase   = new THREE.Vector3();
	// cube shape data
	this.positionSpread = new THREE.Vector3();
	// sphere shape data
	this.positionRadius = 0; // distance from base at which particles start
	
	this.velocityStyle = Type.CUBE;	
	// cube movement data
	this.velocityBase       = new THREE.Vector3();
	this.velocitySpread     = new THREE.Vector3(); 
	// sphere movement data
	//   direction vector calculated using initial position
	this.speedBase   = 0;
	this.speedSpread = 0;
	
	this.accelerationBase   = new THREE.Vector3();
	this.accelerationSpread = new THREE.Vector3();	
	
	this.angleBase               = 0;
	this.angleSpread             = 0;
	this.angleVelocityBase       = 0;
	this.angleVelocitySpread     = 0;
	this.angleAccelerationBase   = 0;
	this.angleAccelerationSpread = 0;
	
	this.sizeBase   = 0.0;
	this.sizeSpread = 0.0;
	this.sizeChange  = new Change();
			
	// store colors in HSL format in a THREE.Vector3 object
	// http://en.wikipedia.org/wiki/HSL_and_HSV
	this.colorBase   = new THREE.Vector3(0.0, 1.0, 0.5); 
	this.colorSpread = new THREE.Vector3(0.0, 0.0, 0.0);
	this.colorChange  = new Change();
	
	this.opacityBase   = 1.0;
	this.opacitySpread = 0.0;
	this.opacityChange  = new Change();

	this.particleArray = [];
	this.particlesPerSecond = 100;
	this.particleDeathAge = 1.0;
	
	////////////////////////
	// EMITTER PROPERTIES //
	////////////////////////
	
	this.emitterAge      = 0.0;
	this.emitterAlive    = true;
	this.emitterDeathAge = 60; // time (seconds) at which to stop creating particles.
	
	// How many particles could be active at any time?
	this.particleCount = this.particlesPerSecond * Math.min( this.particleDeathAge, this.emitterDeathAge );


	// Generate paramters
	const positionArray = new Float32Array(this.particleCount * 3);
	const VisibleArray = new Float32Array(this.particleCount * 1);
	const AngleArray = new Float32Array(this.particleCount * 1);
	const SizeArray = new Float32Array(this.particleCount * 1);
	const OpacityArray = new Float32Array(this.particleCount * 1);
	const ColorArray = new Float32Array(this.particleCount * 3);

	this.particleGeometry = new THREE.BufferGeometry();
	this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
	this.particleGeometry.setAttribute('customVisible', new THREE.BufferAttribute(VisibleArray, 1));
	this.particleGeometry.setAttribute('customAngle', new THREE.BufferAttribute(AngleArray, 1));
	this.particleGeometry.setAttribute('customSize', new THREE.BufferAttribute(SizeArray, 1));
	this.particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(OpacityArray, 1));
	this.particleGeometry.setAttribute('customColor', new THREE.BufferAttribute(ColorArray, 3));

	this.particleTexture  = null;
	this.particleMaterial = new THREE.ShaderMaterial( 
		{
			uniforms: 
			{
				texture1:   { type: "t", value: this.particleTexture },
			},
			vertexShader:   particleVertexShader,
			fragmentShader: particleFragmentShader,
			depthTest: true,
			depthWrite: false,
			transparent: true,
			blending: THREE.CustomBlending,
			blendEquation: THREE.AddEquation,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,

	});

	this.particleMesh = new THREE.Mesh();
}
	
ParticleFireball.prototype.setValues = function( parameters )
{
	if ( parameters === undefined ) return;
	
	// clear any previous Changes that might exist
	this.sizeChange    = new Change();
	this.colorChange   = new Change();
	this.opacityChange = new Change();
	
	for ( var key in parameters ){

		this[ key ] = parameters[ key ];
	} 
		
	
	// attach Changes to particles

	Particle1.prototype.sizeChange    = this.sizeChange;
	Particle1.prototype.colorChange   = this.colorChange;
	Particle1.prototype.opacityChange = this.opacityChange;
	
	// calculate/set derived particle engine values
	this.particleArray = [];
	this.emitterAge      = 0.0;
	this.emitterAlive    = true;
	this.particleCount = this.particlesPerSecond * Math.min( this.particleDeathAge, this.emitterDeathAge );
	

	const positionArray = new Float32Array(this.particleCount * 3);
	const VisibleArray = new Float32Array(this.particleCount * 1);
	const AngleArray = new Float32Array(this.particleCount * 1);
	const SizeArray = new Float32Array(this.particleCount * 1);
	const OpacityArray = new Float32Array(this.particleCount * 1);
	const ColorArray = new Float32Array(this.particleCount * 3);
	const BlendArray = new Float32Array(this.particleCount * 1);

	this.particleGeometry = new THREE.BufferGeometry();
	this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
	this.particleGeometry.setAttribute('customVisible', new THREE.BufferAttribute(VisibleArray, 1));
	this.particleGeometry.setAttribute('customAngle', new THREE.BufferAttribute(AngleArray, 1));
	this.particleGeometry.setAttribute('customSize', new THREE.BufferAttribute(SizeArray, 1));
	this.particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(OpacityArray, 1));
	this.particleGeometry.setAttribute('customColor', new THREE.BufferAttribute(ColorArray, 3));
	this.particleGeometry.setAttribute('blend', new THREE.BufferAttribute(BlendArray, 1));

	this.particleMaterial = new THREE.ShaderMaterial( 
		{
			uniforms: 
			{
				texture1:   { type: "t", value: this.particleTexture },
			},
			vertexShader:   particleVertexShader,
			fragmentShader: particleFragmentShader,
			depthTest: true,
			depthWrite: false,
			transparent: true,
			blending: THREE.CustomBlending,
			blendEquation: THREE.AddEquation,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
	});

	this.particleMesh = new THREE.Points();
}
	
// helper functions for randomization 
ParticleFireball.prototype.randomValue = function(base, spread)
{
	return base + spread * (Math.random() - 0.5);
}
ParticleFireball.prototype.randomVector3 = function(base, spread)
{
	var rand3 = new THREE.Vector3( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 );
	// console.log(base);
	// console.log(spread);
	// console.log(rand3);
	var tmp = new THREE.Vector3(spread.x * rand3.x, spread.y * rand3.y, spread.z * rand3.z );
	// return new THREE.Vector3().addVectors( base, new THREE.Vector3().multiplyVectors( spread, rand3 ) );
	return new THREE.Vector3(base.x + tmp.x, base.y + tmp.y, base.z + tmp.z);
}

ParticleFireball.prototype.createParticle = function()
{
	var particle = new Particle1();
	// this.positionBase = new THREE.Vector3();
	// this.positionSpread = new THREE.Vector3();
	if (this.positionStyle == Type.CUBE)
		particle.position = this.randomVector3( this.positionBase, this.positionSpread ); 
	if (this.positionStyle == Type.SPHERE)
	{
		var z = 2 * Math.random() - 1;
		var t = 6.2832 * Math.random();
		var r = Math.sqrt( 1 - z*z );
		var vec3 = new THREE.Vector3( r * Math.cos(t), r * Math.sin(t), z );
		particle.position = new THREE.Vector3().addVectors( this.positionBase, vec3.multiplyScalar( this.positionRadius ) );
	}
		
	if ( this.velocityStyle == Type.CUBE )
	{
		particle.velocity     = this.randomVector3( this.velocityBase,     this.velocitySpread ); 
	}
	if ( this.velocityStyle == Type.SPHERE )
	{
		var direction = new THREE.Vector3().subVectors( particle.position, this.positionBase );
		var speed     = this.randomValue( this.speedBase, this.speedSpread );
		particle.velocity  = direction.normalize().multiplyScalar( speed );
	}
	
	particle.acceleration = this.randomVector3( this.accelerationBase, this.accelerationSpread ); 

	particle.angle             = this.randomValue( this.angleBase,             this.angleSpread );
	particle.angleVelocity     = this.randomValue( this.angleVelocityBase,     this.angleVelocitySpread );
	particle.angleAcceleration = this.randomValue( this.angleAccelerationBase, this.angleAccelerationSpread );

	particle.size = this.randomValue( this.sizeBase, this.sizeSpread );

	var color = this.randomVector3( this.colorBase, this.colorSpread );
	particle.color = new THREE.Color().setHSL( color.x, color.y, color.z );
	
	particle.opacity = this.randomValue( this.opacityBase, this.opacitySpread );

	particle.age   = 0;
	particle.alive = 0; // particles initialize as inactive
	
	return particle;
}

ParticleFireball.prototype.initialize = function()
{
	// link particle data with geometry/material data
	const positionArray = new Float32Array(this.particleCount * 3);
	const VisibleArray = new Float32Array(this.particleCount * 1);
	const AngleArray = new Float32Array(this.particleCount * 1);
	const SizeArray = new Float32Array(this.particleCount * 1);
	const OpacityArray = new Float32Array(this.particleCount * 1);
	const ColorArray = new Float32Array(this.particleCount * 3);
	const BlendArray = new Float32Array(this.particleCount * 1);

	for (var i = 0; i < this.particleCount; i++)
	{
		// remove duplicate code somehow, here and in update function below.
		this.particleArray[i] = this.createParticle();

		positionArray[i * 3 + 0] = this.particleArray[i].position.x;
		positionArray[i * 3 + 1] = this.particleArray[i].position.y;
		positionArray[i * 3 + 2] = this.particleArray[i].position.z;
		VisibleArray[i] =  this.particleArray[i].alive;
		AngleArray[i] =  this.particleArray[i].angle;
		SizeArray[i] = this.particleArray[i].size;
		OpacityArray[i] =  this.particleArray[i].opacity;
		BlendArray[i] = 1.0;
		ColorArray[i * 3 + 0] = this.particleArray[i].color.r;
		ColorArray[i * 3 + 1] = this.particleArray[i].color.g;
		ColorArray[i * 3 + 2] = this.particleArray[i].color.n;
	}

	this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
	this.particleGeometry.setAttribute('customVisible', new THREE.BufferAttribute(VisibleArray, 1));
	this.particleGeometry.setAttribute('customAngle', new THREE.BufferAttribute(AngleArray, 1));
	this.particleGeometry.setAttribute('customSize', new THREE.BufferAttribute(SizeArray, 1));
	this.particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(OpacityArray, 1));
	this.particleGeometry.setAttribute('customColor', new THREE.BufferAttribute(ColorArray, 3));
	this.particleGeometry.setAttribute('blend', new THREE.BufferAttribute(BlendArray, 1));

	this.particleMesh = new THREE.Points( this.particleGeometry, this.particleMaterial );
	this.particleMesh.dynamic = true;
	this.particleMesh.sortParticles = true;
	console.log(this.particleMesh);
	scene.add( this.particleMesh );
}

ParticleFireball.prototype.update = function(dt)
{
	var recycleIndices = [];
	const positionArray = new Float32Array(this.particleCount * 3);
	const VisibleArray = new Float32Array(this.particleCount * 1);
	const AngleArray = new Float32Array(this.particleCount * 1);
	const SizeArray = new Float32Array(this.particleCount * 1);
	const OpacityArray = new Float32Array(this.particleCount * 1);
	const ColorArray = new Float32Array(this.particleCount * 3);
	const BlendArray = new Float32Array(this.particleCount * 1);

	// update particle data
	for (var i = 0; i < this.particleCount; i++)
	{
		if ( this.particleArray[i].alive )
		{
			this.particleArray[i].update(dt);
			// check if particle should expire
			// could also use: death by size<0 or alpha<0.
			if ( this.particleArray[i].age > this.particleDeathAge ) 
			{
				this.particleArray[i].alive = 0.0;
				recycleIndices.push(i);
			}
			// update particle properties in shader
			positionArray[i * 3 + 0] = this.particleArray[i].position.x;
			positionArray[i * 3 + 1] = this.particleArray[i].position.y;
			positionArray[i * 3 + 2] = this.particleArray[i].position.z;
			VisibleArray[i] =  this.particleArray[i].alive;
			AngleArray[i] =  this.particleArray[i].angle;
			SizeArray[i] = this.particleArray[i].size;
			OpacityArray[i] =  this.particleArray[i].opacity;
			BlendArray[i] = 1.0;
			ColorArray[i * 3 + 0] = this.particleArray[i].color.r;
			ColorArray[i * 3 + 1] = this.particleArray[i].color.g;
			ColorArray[i * 3 + 2] = this.particleArray[i].color.n;
		}
	}
	this.particleGeometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
	this.particleGeometry.setAttribute('customVisible', new THREE.BufferAttribute(VisibleArray, 1));
	this.particleGeometry.setAttribute('customAngle', new THREE.BufferAttribute(AngleArray, 1));
	this.particleGeometry.setAttribute('customSize', new THREE.BufferAttribute(SizeArray, 1));
	this.particleGeometry.setAttribute('customOpacity', new THREE.BufferAttribute(OpacityArray, 1));
	this.particleGeometry.setAttribute('customColor', new THREE.BufferAttribute(ColorArray, 3));
	this.particleGeometry.setAttribute('blend', new THREE.BufferAttribute(BlendArray, 1));
	// check if particle emitter is still running
	if ( !this.emitterAlive ) return;

	// if no particles have died yet, then there are still particles to activate
	if ( this.emitterAge < this.particleDeathAge )
	{
		// determine indices of particles to activate
		var startIndex = Math.round( this.particlesPerSecond * (this.emitterAge +  0) );
		var   endIndex = Math.round( this.particlesPerSecond * (this.emitterAge + dt) );
		if  ( endIndex > this.particleCount ) 
			  endIndex = this.particleCount; 
			  
		for (var i = startIndex; i < endIndex; i++)
			this.particleArray[i].alive = 1.0;		
	}

	// if any particles have died while the emitter is still running, we imediately recycle them
	for (var j = 0; j < recycleIndices.length; j++)
	{
		var i = recycleIndices[j];
		this.particleArray[i] = this.createParticle();
		this.particleArray[i].alive = 1.0; // activate right away
		this.particleGeometry.attributes.position.setXYZ(i, this.particleArray[i].position.x, this.particleArray[i].position.y, this.particleArray[i].position.z);
		this.particleGeometry.attributes.position.needsUpdate = true;
	}

	// stop emitter?
	this.emitterAge += dt;
	if ( this.emitterAge > this.emitterDeathAge )  this.emitterAlive = false;
}

ParticleFireball.prototype.destroy = function()
{
    scene.remove( this.particleMesh );
}
///////////////////////////////////////////////////////////////////////////////