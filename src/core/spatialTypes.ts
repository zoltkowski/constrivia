import type { ObjectId } from './runtimeTypes';
export type Vec3 = {
    x: number;
    y: number;
    z: number;
};
export type Mat3 = [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
];
export type SpatialPointDefinition = {
    groupId: ObjectId;
    binding: {
        kind: 'position';
        position: Vec3;
    } | {
        kind: 'planeFoot';
        source: ObjectId;
        planePoints: [ObjectId, ObjectId, ObjectId];
    } | {
        kind: 'sectionEdge';
        sectionId: ObjectId;
        endpoints: [ObjectId, ObjectId];
    } | {
        kind: 'polygonIntersection';
        polygons: [ObjectId, ObjectId];
        segment: number;
        endpoint: 0 | 1;
    } | {
        kind: 'vertex';
        solidId: ObjectId;
        vertex: number;
    } | {
        kind: 'edge';
        endpoints: [
            ObjectId,
            ObjectId
        ];
        t: number;
        fixed?: boolean;
        unbounded?: boolean;
    } | {
        kind: 'direction';
        through: ObjectId;
        reference: [
            ObjectId,
            ObjectId
        ];
        perpendicular?: boolean;
        planeGuide?: ObjectId | [
            ObjectId,
            ObjectId
        ];
    };
};
export type SpatialAngleDefinition = {
    groupId: ObjectId;
    arms: [
        [
            ObjectId,
            ObjectId
        ],
        [
            ObjectId,
            ObjectId
        ]
    ];
    acute?: boolean;
};
export type SpatialGroup = {
    id: ObjectId;
    anchor: {
        x: number;
        y: number;
    };
    orientation: Mat3;
    pivot: Vec3;
};
export type Cuboid = {
    shadowOpacity?: number;
    shapeLocked?: boolean;
    /** Prevent component drags from changing the height; whole-solid scaling stays proportional. */
    heightLocked?: boolean;
    cutSectionId?: ObjectId;
    hiddenApexSectionId?: ObjectId;
    /** Absent in legacy cuboids; polygon-based solids retain the same common fields. */
    polyhedron?: {
        kind: 'prism' | 'pyramid';
        basePoints: ObjectId[];
        normal: Vec3;
        normalSign?: 1 | -1;
        height: number;
        offset: Vec3;
        rightLocked: boolean;
        faceVertices: ObjectId[][];
    };
    faces?: ObjectId[];
    id: ObjectId;
    groupId: ObjectId;
    origin: Vec3;
    originPointId?: ObjectId;
    basis: Mat3;
    size: Vec3;
    vertices: ObjectId[];
    edges: ObjectId[];
    hidden?: boolean;
};
export type SpatialFace = {
    polygonId?: ObjectId;
    faceIndex?: number;
    solidId: ObjectId;
    axis: 0 | 1 | 2;
    side: 0 | 1;
    points: Array<{
        x: number;
        y: number;
    }>;
    center: {
        x: number;
        y: number;
    };
    depth: number;
    visible: boolean;
};
export type SpatialSectionDefinition = {
    solidId: ObjectId;
    plane: { kind: 'parallel'; polygonId: ObjectId; pointId: ObjectId }
        | { kind: 'points'; points: [ObjectId, ObjectId, ObjectId] };
    edgePoints: Record<string, ObjectId>;
    edgeLines?: Record<string, ObjectId>;
};
export type SpatialHandle = {
    planeFaceId?: ObjectId;
    kind: 'rotate' | 'rotateAxis' | 'scale' | 'move' | 'resize';
    groupId: ObjectId;
    solidId: ObjectId;
    x: number;
    y: number;
    axis?: 0 | 1 | 2;
    side?: 0 | 1;
    value?: number;
};
