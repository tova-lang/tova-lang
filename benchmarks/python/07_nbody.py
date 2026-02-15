import time
import math

PI = 3.141592653589793
SOLAR_MASS = 4.0 * PI * PI
DAYS_PER_YEAR = 365.24

def make_body(x, y, z, vx, vy, vz, mass):
    return [x, y, z, vx, vy, vz, mass]

# Indices
X, Y, Z, VX, VY, VZ, MASS = 0, 1, 2, 3, 4, 5, 6

bodies = [
    # Sun
    make_body(0, 0, 0, 0, 0, 0, SOLAR_MASS),
    # Jupiter
    make_body(
        4.84143144246472090,
        -1.16032004402742839,
        -1.03622044471123109,
        0.00166007664274403694 * DAYS_PER_YEAR,
        0.00769901118419740425 * DAYS_PER_YEAR,
        -0.00690460016972063023 * DAYS_PER_YEAR,
        0.000954791938424326609 * SOLAR_MASS,
    ),
    # Saturn
    make_body(
        8.34336671824457987,
        4.12479856412430479,
        -4.03523417114321381,
        -0.00276742510726862411 * DAYS_PER_YEAR,
        0.00499852801234917238 * DAYS_PER_YEAR,
        0.00230417297573763929 * DAYS_PER_YEAR,
        0.000285885980666130812 * SOLAR_MASS,
    ),
]

# Offset momentum
px = py = pz = 0.0
for b in bodies:
    px += b[VX] * b[MASS]
    py += b[VY] * b[MASS]
    pz += b[VZ] * b[MASS]
bodies[0][VX] = -px / SOLAR_MASS
bodies[0][VY] = -py / SOLAR_MASS
bodies[0][VZ] = -pz / SOLAR_MASS

def energy(bodies):
    nbodies = len(bodies)
    e = 0.0
    for i in range(nbodies):
        bi = bodies[i]
        e += 0.5 * bi[MASS] * (bi[VX]**2 + bi[VY]**2 + bi[VZ]**2)
        for j in range(i + 1, nbodies):
            bj = bodies[j]
            dx = bi[X] - bj[X]
            dy = bi[Y] - bj[Y]
            dz = bi[Z] - bj[Z]
            dist = math.sqrt(dx*dx + dy*dy + dz*dz)
            e -= (bi[MASS] * bj[MASS]) / dist
    return e

def advance(bodies, dt):
    nbodies = len(bodies)
    for i in range(nbodies):
        bi = bodies[i]
        for j in range(i + 1, nbodies):
            bj = bodies[j]
            dx = bi[X] - bj[X]
            dy = bi[Y] - bj[Y]
            dz = bi[Z] - bj[Z]
            dist_sq = dx*dx + dy*dy + dz*dz
            dist = math.sqrt(dist_sq)
            mag = dt / (dist_sq * dist)

            bi[VX] -= dx * bj[MASS] * mag
            bi[VY] -= dy * bj[MASS] * mag
            bi[VZ] -= dz * bj[MASS] * mag

            bj[VX] += dx * bi[MASS] * mag
            bj[VY] += dy * bi[MASS] * mag
            bj[VZ] += dz * bi[MASS] * mag

    for b in bodies:
        b[X] += dt * b[VX]
        b[Y] += dt * b[VY]
        b[Z] += dt * b[VZ]

e_before = energy(bodies)

steps = 500000

start = time.perf_counter()
for _ in range(steps):
    advance(bodies, 0.01)
elapsed = (time.perf_counter() - start) * 1000

e_after = energy(bodies)

print("BENCHMARK: nbody")
print(f"steps={steps}")
print(f"energy_before={e_before}")
print(f"energy_after={e_after}")
print(f"time={elapsed}ms")
