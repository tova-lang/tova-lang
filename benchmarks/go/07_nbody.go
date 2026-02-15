package main

import (
	"fmt"
	"math"
	"time"
)

type Body struct {
	x, y, z    float64
	vx, vy, vz float64
	mass       float64
}

const (
	PI            = 3.141592653589793
	SOLAR_MASS    = 4.0 * PI * PI
	DAYS_PER_YEAR = 365.24
)

func advance(bodies []Body, dt float64) {
	nbodies := len(bodies)
	for i := 0; i < nbodies; i++ {
		for j := i + 1; j < nbodies; j++ {
			dx := bodies[i].x - bodies[j].x
			dy := bodies[i].y - bodies[j].y
			dz := bodies[i].z - bodies[j].z
			distSq := dx*dx + dy*dy + dz*dz
			dist := math.Sqrt(distSq)
			mag := dt / (distSq * dist)

			bodies[i].vx -= dx * bodies[j].mass * mag
			bodies[i].vy -= dy * bodies[j].mass * mag
			bodies[i].vz -= dz * bodies[j].mass * mag

			bodies[j].vx += dx * bodies[i].mass * mag
			bodies[j].vy += dy * bodies[i].mass * mag
			bodies[j].vz += dz * bodies[i].mass * mag
		}
	}

	for i := 0; i < nbodies; i++ {
		bodies[i].x += dt * bodies[i].vx
		bodies[i].y += dt * bodies[i].vy
		bodies[i].z += dt * bodies[i].vz
	}
}

func energy(bodies []Body) float64 {
	nbodies := len(bodies)
	e := 0.0
	for i := 0; i < nbodies; i++ {
		e += 0.5 * bodies[i].mass * (bodies[i].vx*bodies[i].vx + bodies[i].vy*bodies[i].vy + bodies[i].vz*bodies[i].vz)
		for j := i + 1; j < nbodies; j++ {
			dx := bodies[i].x - bodies[j].x
			dy := bodies[i].y - bodies[j].y
			dz := bodies[i].z - bodies[j].z
			dist := math.Sqrt(dx*dx + dy*dy + dz*dz)
			e -= (bodies[i].mass * bodies[j].mass) / dist
		}
	}
	return e
}

func main() {
	bodies := []Body{
		{0, 0, 0, 0, 0, 0, SOLAR_MASS},
		{
			4.84143144246472090,
			-1.16032004402742839,
			-1.03622044471123109,
			0.00166007664274403694 * DAYS_PER_YEAR,
			0.00769901118419740425 * DAYS_PER_YEAR,
			-0.00690460016972063023 * DAYS_PER_YEAR,
			0.000954791938424326609 * SOLAR_MASS,
		},
		{
			8.34336671824457987,
			4.12479856412430479,
			-4.03523417114321381,
			-0.00276742510726862411 * DAYS_PER_YEAR,
			0.00499852801234917238 * DAYS_PER_YEAR,
			0.00230417297573763929 * DAYS_PER_YEAR,
			0.000285885980666130812 * SOLAR_MASS,
		},
	}

	px, py, pz := 0.0, 0.0, 0.0
	for _, b := range bodies {
		px += b.vx * b.mass
		py += b.vy * b.mass
		pz += b.vz * b.mass
	}
	bodies[0].vx = -px / SOLAR_MASS
	bodies[0].vy = -py / SOLAR_MASS
	bodies[0].vz = -pz / SOLAR_MASS

	eBefore := energy(bodies)

	steps := 500000

	start := time.Now()
	for i := 0; i < steps; i++ {
		advance(bodies, 0.01)
	}
	elapsed := time.Since(start).Seconds() * 1000

	eAfter := energy(bodies)

	fmt.Println("BENCHMARK: nbody")
	fmt.Printf("steps=%d\n", steps)
	fmt.Printf("energy_before=%.17f\n", eBefore)
	fmt.Printf("energy_after=%.17f\n", eAfter)
	fmt.Printf("time=%.6fms\n", elapsed)
}
