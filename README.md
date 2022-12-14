## Jump Flood Algorithm
![The letters JFA after calculating a distance transform](example.png?raw=true "Example 1")

The jump flood algorithm is used to calculate the distance from a pixel to the closest valid pixel in a source image on the GPU. 
This repository implements the jump flood algorithm in WebGL, a demo can be seen [here](https://patricklbell.github.io/jsjfa "Demo"),
Simply draw some shapes with the mouse and press play to see the steps the algorithm takes, pressing calculate distance transform
darkens each pixel based on how far they are from their source pixel.

![Dots after JFA forming a Voronoi diagram](example2.png?raw=true "Example 2")
Using dots as a source image creates a [Voronoi diagram](https://en.wikipedia.org/wiki/Voronoi_diagram, "Voronoi Wikipedia").
