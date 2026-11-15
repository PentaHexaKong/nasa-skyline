'''The terrain maps the engine reads, by nominal spacing in metres (`localResolutionM`). The frontend uses the same numbers
(frontend/src/lib/data.ts, POLAR_TERRAIN_M and GLOBAL_TERRAIN_M).'''

POLAR_TERRAIN_M = 80
'''LOLA's 80 m south-polar map (20 m is the optional finer one).'''

GLOBAL_TERRAIN_M = 1895.21
'''LOLA's global LDEM_16: 16 pixels per degree on the 1737.4 km sphere, about 1895 m at the equator. Coarse, exploratory.'''
