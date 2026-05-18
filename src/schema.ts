import { z } from "zod";

const BoardCoordSchema = z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
]);
export type BoardCoord = z.infer<typeof BoardCoordSchema>;
export const board_coords = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

export function is_coord(n: number): n is BoardCoord {
    return Number.isInteger(n) && 0 <= n && n < 9;
}

const PositionSchema = z.tuple([BoardCoordSchema, BoardCoordSchema]);
export type Position = z.infer<typeof PositionSchema>;

export function is_pos(p: [number, number]): p is Position {
    const [r, c] = p;
    return is_coord(r) && is_coord(c);
}

export type Side = "left" | "right" | "top" | "bottom";
export type PositionExtended =
    Position |
    ["left", BoardCoord] |
    ["right", BoardCoord] |
    ["top", BoardCoord] |
    ["bottom", BoardCoord];

export function* position_generator(
    [r1, c1]: Position = [0, 0], [r2, c2]: Position = [8, 8]
): Generator<Position> {
    for (const r of board_coords) {
        for (const c of board_coords) {
            if (r1 <= r && r <= r2 && c1 <= c && c <= c2) yield [r, c];
        }
    }
}

const DigitSchema = z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
    z.literal(8),
    z.literal(9),
]);
export type Digit = z.infer<typeof DigitSchema>;
export const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

const DigitOrZeroSchema = z.union([DigitSchema, z.literal(0)]);
export type DigitOrZero = z.infer<typeof DigitOrZeroSchema>;

const DirectionSchema = z.enum(["ROW", "COL"]);
export type Direction = z.infer<typeof DirectionSchema>;
const DirectionExtendedSchema = z.enum(["ROW_LEFT", "ROW", "COL_TOP", "COL"]);
export type DirectionExtended = z.infer<typeof DirectionExtendedSchema>;

const SetLikeSchema = z.record(z.string(), z.literal(true));

const FixedCellStateSchema = z.object({
    fixed: z.literal(true),
    number: DigitSchema,
    color: SetLikeSchema,
});

const EmptyCellStateSchema = z.object({
    fixed: z.literal(false),
    number: DigitSchema.nullable(),
    corner: SetLikeSchema,
    center: SetLikeSchema,
    color: SetLikeSchema,
});

const CellStateSchema = z.discriminatedUnion("fixed", [
    FixedCellStateSchema,
    EmptyCellStateSchema,
]);

const BoardStateSchema = z.array(
    z.array(CellStateSchema).length(9)
).length(9);
export type BoardState = z.infer<typeof BoardStateSchema>;

const SingleNumberChangeSchema = z.object({
    pos: PositionSchema,
    number: DigitSchema.nullable(),
});
export type SingleNumberChange = z.infer<typeof SingleNumberChangeSchema>;

const NumberChangeSchema = z.object({
    type: z.literal("normal"),
    before: z.array(SingleNumberChangeSchema),
    after: DigitSchema.nullable(),
});

const MemoChangeSchema = z.object({
    type: z.enum(["corner", "center", "color"]),
    delete: z.literal(false),
    pos: z.array(PositionSchema),
    memo: DigitOrZeroSchema,
});

const SingleMemoDeleteSchema = z.object({
    pos: PositionSchema,
    memo: SetLikeSchema,
});
export type SingleMemoDelete = z.infer<typeof SingleMemoDeleteSchema>;

const MemoDeleteSchema = z.object({
    type: z.enum(["corner", "center", "color"]),
    delete: z.literal(true),
    before: z.array(SingleMemoDeleteSchema),
})

const BoardChangeSchema = z.union([
    NumberChangeSchema,
    MemoChangeSchema,
    MemoDeleteSchema,
]);
export type BoardChange = z.infer<typeof BoardChangeSchema>;

export const SolvingStateSchema = z.object({
    board: BoardStateSchema,
    undo: z.array(BoardChangeSchema),
    redo: z.array(BoardChangeSchema),
});
export type SolvingState = z.infer<typeof SolvingStateSchema>;

const CompressedFixedCellStateSchema = z.tuple([
    DigitSchema,
    z.string(),
]);

const CompressedEmptyCellStateSchema = z.tuple([
    z.union([DigitSchema, z.literal(0)]),
    z.string(),
    z.string(),
    z.string(),
]);

const CompressedCellStateSchema = z.union([
    CompressedFixedCellStateSchema,
    CompressedEmptyCellStateSchema,
]);

const CompressedBoardStateSchema = z.array(
    z.array(CompressedCellStateSchema).length(9)
).length(9);

const CompressedNumberChangeSchema = z.tuple([
    z.literal(0),
    z.array(z.number()),
    DigitOrZeroSchema,
]);

const CompressedMemoChangeSchema = z.tuple([
    z.union([z.literal(1), z.literal(2), z.literal(3)]),
    z.union([z.number(), z.string()]),
    DigitOrZeroSchema,
]);

const CompressedMemoDeleteSchema = z.tuple([
    z.union([z.literal(4), z.literal(5), z.literal(6)]),
    z.array(z.tuple([z.number(), z.string()])),
]);

const CompressedBoardChangeSchema = z.union([
    CompressedNumberChangeSchema,
    CompressedMemoChangeSchema,
    CompressedMemoDeleteSchema,
]);
export type CompressedBoardChange = z.infer<typeof CompressedBoardChangeSchema>;

export const CompressedSolvingStateSchema = z.tuple([
    CompressedBoardStateSchema,
    z.array(CompressedBoardChangeSchema),
    z.array(CompressedBoardChangeSchema),
]);
export type CompressedSolvingState = z.infer<typeof CompressedSolvingStateSchema>;

const SudokuRuleSchema = z.object({
    id: z.literal("[Sudoku]"),
});

const RowRuleSchema = z.object({
    id: z.literal("[R]"),
});

const ColumnRuleSchema = z.object({
    id: z.literal("[C]"),
});

const BoxRuleSchema = z.object({
    id: z.literal("[B]"),
});

const DistantRuleSchema = z.object({
    id: z.literal("[DT]"),
});

const SegmentRuleSchema = z.object({
    id: z.literal("[SG]"),
    render_state: z.object({
        regions: z.array(z.array(PositionSchema)),
    }),
});
export type SegmentRule = z.infer<typeof SegmentRuleSchema>;

const LinkRuleSchema = z.object({
    id: z.literal("[LK]"),
    render_state: z.object({
        edges: z.array(
            z.tuple([PositionSchema, PositionSchema])
        ),
    }),
});
export type LinkRule = z.infer<typeof LinkRuleSchema>;

const LotusRuleSchema = z.object({
    id: z.literal("[LO]"),
    render_state: z.object({
        cells: z.array(PositionSchema),
    }),
});
export type LotusRule = z.infer<typeof LotusRuleSchema>;

const MetroRuleSchema = z.object({
    id: z.literal("[MR]"),
    render_state: z.object({
        metros: z.array(z.array(PositionSchema)),
    }),
});
export type MetroRule = z.infer<typeof MetroRuleSchema>;

const SequenceRuleSchema = z.object({
    id: z.literal("[SQ]"),
    render_state: z.object({
        side_hints: z.array(
            z.tuple([
                DirectionSchema,
                BoardCoordSchema,
                z.array(DigitSchema),
            ])
        ),
    }),
});
export type SequenceRule = z.infer<typeof SequenceRuleSchema>;

const QuantumRuleSchema = z.object({
    id: z.literal("[QT]"),
    render_state: z.object({
        side_hints: z.array(
            z.tuple([
                DirectionSchema,
                BoardCoordSchema,
                z.tuple([DigitSchema, DigitSchema]),
            ])
        ),
    }),
});
export type QuantumRule = z.infer<typeof QuantumRuleSchema>;

const RangeRuleSchema = z.object({
    id: z.literal("[RG]"),
    render_state: z.object({
        side_hints: z.array(
            z.tuple([
                DirectionSchema,
                BoardCoordSchema,
                z.tuple([z.int()]),
            ])
        ),
    }),
});
export type RangeRule = z.infer<typeof RangeRuleSchema>;

const QuadRuleSchema = z.object({
    id: z.literal("[QD]"),
});

const ReferenceRuleSchema = z.object({
    id: z.literal("[RF]"),
    render_state: z.object({
        lines: z.array(
            z.tuple([
                DirectionSchema,
                BoardCoordSchema,
            ])
        ),
    }),
});
export type ReferenceRule = z.infer<typeof ReferenceRuleSchema>;

const PrismRuleSchema = z.object({
    id: z.literal("[PR]"),
    render_state: z.object({
        edges: z.array(
            z.tuple([
                BoardCoordSchema,
                BoardCoordSchema,
                BoardCoordSchema,
                BoardCoordSchema,
                z.boolean(),
            ])
        ),
    }),
});
export type PrismRule = z.infer<typeof PrismRuleSchema>;

const TemperatureRuleSchema = z.object({
    id: z.literal("[TM]"),
    render_state: z.object({
        regions: z.array(
            z.object({
                cells: z.tuple([PositionSchema, PositionSchema, PositionSchema]),
                color: z.enum(["red", "green", "blue"]),
            })
        ),
    }),
});
export type TemperatureRule = z.infer<typeof TemperatureRuleSchema>;

const RootRuleSchema = z.object({
    id: z.literal("[RT]"),
    render_state: z.object({
        cells: z.array(
            z.tuple([BoardCoordSchema, BoardCoordSchema, z.int()])
        ),
    }),
});
export type RootRule = z.infer<typeof RootRuleSchema>;

const PointRuleSchema = z.object({
    id: z.literal("[PO]"),
    render_state: z.object({
        edges: z.array(
            z.tuple([PositionSchema, PositionSchema])
        ),
    }),
});
export type PointRule = z.infer<typeof PointRuleSchema>;

const StencilRuleSchema = z.object({
    id: z.literal("[ST]"),
    render_state: z.object({
        pieces: z.array(
            z.object({
                cells: z.array(PositionSchema),
                values: z.record(z.string(), DigitSchema.optional()),
            })
        ),
    }),
});
export type StencilRule = z.infer<typeof StencilRuleSchema>;

const VectorRuleSchema = z.object({
    id: z.literal("[VT]"),
    render_state: z.object({
        arrows: z.array(
            z.tuple([BoardCoordSchema, BoardCoordSchema, z.enum(["L", "R", "U", "D"])])
        ),
    }),
});
export type VectorRule = z.infer<typeof VectorRuleSchema>;

const StreamRuleSchema = z.object({
    id: z.literal("[SR]"),
    render_state: z.object({
        streams: z.array(z.array(PositionSchema)),
    }),
});
export type StreamRule = z.infer<typeof StreamRuleSchema>;

const PairRuleSchema = z.object({
    id: z.literal("[PA]"),
    render_state: z.object({
        dominoes: z.array(
            z.tuple([PositionSchema, PositionSchema])
        ),
    }),
});
export type PairRule = z.infer<typeof PairRuleSchema>;

const InversionRuleSchema = z.object({
    id: z.literal("[IV]"),
    render_state: z.object({
        lines: z.array(z.array(PositionSchema)),
    }),
});
export type InversionRule = z.infer<typeof InversionRuleSchema>;

const TrailRuleSchema = z.object({
    id: z.literal("[TR]"),
    render_state: z.object({
        start: PositionSchema,
        end: PositionSchema,
    }),
});
export type TrailRule = z.infer<typeof TrailRuleSchema>;

const EscapeRuleSchema = z.object({
    id: z.literal("[ES]"),
});

const TripletRuleSchema = z.object({
    id: z.literal("[TP]"),
});

const EpsilonRuleSchema = z.object({
    id: z.literal("[EP]"),
});

const ProductRuleSchema = z.object({
    id: z.literal("[PD]"),
    render_state: z.object({
        side_hints: z.array(
            z.tuple([
                DirectionExtendedSchema,
                BoardCoordSchema,
                z.number()
            ])
        ),
    }),
});
export type ProductRule = z.infer<typeof ProductRuleSchema>;

const BumperRuleSchema = z.object({
    id: z.literal("[BP]"),
});

const BridgeRuleSchema = z.object({
    id: z.literal("[BD]"),
    render_state: z.object({
        start_rows: z.array(BoardCoordSchema),
    }),
});
export type BridgeRule = z.infer<typeof BridgeRuleSchema>;

const ReflexRuleSchema = z.object({
    id: z.literal("[EF]"),
    render_state: z.object({
        marked_cells: z.array(PositionSchema),
    }),
});
export type ReflexRule = z.infer<typeof ReflexRuleSchema>;

const AquariumRuleSchema = z.object({
    id: z.literal("[AQ]"),
    render_state: z.object({
        regions: z.array(z.array(PositionSchema)),
    }),
});
export type AquariumRule = z.infer<typeof AquariumRuleSchema>;

const MetaRuleSchema = z.object({
    id: z.literal("[MT]"),
    render_state: z.object({
        diamond_cells: z.array(PositionSchema),
    }),
});
export type MetaRule = z.infer<typeof MetaRuleSchema>;

const LinkPrimeRuleSchema = z.object({
    id: z.literal("[LK']"),
    render_state: z.object({
        edges: z.array(
            z.tuple([PositionSchema, PositionSchema])
        ),
    }),
});
export type LinkPrimeRule = z.infer<typeof LinkPrimeRuleSchema>;

const PrismPrimeRuleSchema = z.object({
    id: z.literal("[PR']"),
    render_state: z.object({
        triplets: z.array(
            z.tuple([
                BoardCoordSchema,
                BoardCoordSchema,
                BoardCoordSchema,
                BoardCoordSchema,
                BoardCoordSchema,
                BoardCoordSchema,
                z.boolean(),
            ])
        ),
    }),
});
export type PrismPrimeRule = z.infer<typeof PrismPrimeRuleSchema>;

const LotusPrimeRuleSchema = z.object({
    id: z.literal("[LO']"),
    render_state: z.object({
        cells: z.array(PositionSchema),
    }),
});
export type LotusPrimeRule = z.infer<typeof LotusPrimeRuleSchema>;

const RuleSchema = z.discriminatedUnion("id", [
    SudokuRuleSchema,
    RowRuleSchema,
    ColumnRuleSchema,
    BoxRuleSchema,

    DistantRuleSchema,
    SegmentRuleSchema,
    LinkRuleSchema,
    LotusRuleSchema,
    MetroRuleSchema,

    SequenceRuleSchema,
    QuantumRuleSchema,
    RangeRuleSchema,
    QuadRuleSchema,
    ReferenceRuleSchema,

    PrismRuleSchema,
    TemperatureRuleSchema,
    RootRuleSchema,
    PointRuleSchema,
    StencilRuleSchema,

    VectorRuleSchema,
    StreamRuleSchema,
    PairRuleSchema,
    InversionRuleSchema,
    TrailRuleSchema,

    EscapeRuleSchema,
    TripletRuleSchema,
    EpsilonRuleSchema,
    ProductRuleSchema,
    BumperRuleSchema,

    BridgeRuleSchema,
    ReflexRuleSchema,
    AquariumRuleSchema,
    MetaRuleSchema,
    LinkPrimeRuleSchema,

    PrismPrimeRuleSchema,
    LotusPrimeRuleSchema,
]);

export type Rule = z.infer<typeof RuleSchema>;
export type RuleID = z.infer<typeof RuleSchema>['id'];

export type SideRule = SequenceRule | QuantumRule | RangeRule | ProductRule;

export const PuzzleDataSchema = z.object({
    id: z.string(),
    difficulty: z.union([z.number(), z.literal("?")]),
    board: z.array(z.array(DigitOrZeroSchema).length(9)).length(9),
    rules: z.array(RuleSchema),
});

export type PuzzleData = z.infer<typeof PuzzleDataSchema>;

export const PartialPuzzleDataSchema = z.object({
    id: z.string(),
    difficulty: z.union([z.number(), z.literal("?")]),
    board: z.array(z.array(DigitOrZeroSchema).length(9)).length(9),
    rules: z.array(z.union([RuleSchema, z.object({ id: z.string() })])),
});
