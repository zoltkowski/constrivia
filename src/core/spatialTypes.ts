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
export type SpatialHandle = {
    kind: 'rotate' | 'move' | 'resize';
    groupId: ObjectId;
    solidId: ObjectId;
    x: number;
    y: number;
    axis?: 0 | 1 | 2;
    side?: 0 | 1;
    value?: number;
};
