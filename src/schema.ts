import { z } from "zod";

const PositionSchema = z.tuple([z.number(), z.number()]);

export type Position = z.infer<typeof PositionSchema>;

const FixedCellStateSchema = z.object({
    fixed: z.literal(true),
    number: z.number(),
});

const EmptyCellStateSchema = z.object({
    fixed: z.literal(false),
    number: z.number().nullable(),
    corner: z.record(z.string(), z.literal(true)),
    center: z.record(z.string(), z.literal(true)),
});

const CellStateSchema = z.discriminatedUnion("fixed", [
    FixedCellStateSchema,
    EmptyCellStateSchema,
]);

const BoardChangeSchema = z.array(
    z.object({
        pos: PositionSchema,
        before: EmptyCellStateSchema,
        after: EmptyCellStateSchema,
    })
);

const BoardStateSchema = z.array(
    z.array(CellStateSchema).length(9)
).length(9);

export type BoardState = z.infer<typeof BoardStateSchema>;

const SolvingStateSchema = z.object({
    board: BoardStateSchema,
    undo: z.array(BoardChangeSchema),
    redo: z.array(BoardChangeSchema),
});

export type SolvingState = z.infer<typeof SolvingStateSchema>;

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
                z.enum(["ROW", "COL"]),
                z.number(),
                z.array(z.number()),
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
                z.enum(["ROW", "COL"]),
                z.number(),
                z.tuple([z.number(), z.number()]),
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
                z.enum(["ROW", "COL"]),
                z.number(),
                z.tuple([z.number()]),
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
                z.enum(["ROW", "COL"]),
                z.number(),
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
                z.number(),
                z.number(),
                z.number(),
                z.number(),
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
                color: z.union([z.literal("red"), z.literal("green"), z.literal("blue")])
            })
        ),
    }),
});

export type TemperatureRule = z.infer<typeof TemperatureRuleSchema>;

const RootRuleSchema = z.object({
    id: z.literal("[RT]"),
    render_state: z.object({
        cells: z.array(
            z.tuple([z.number(), z.number(), z.number()])
        ),
    }),
});

export type RootRule = z.infer<typeof RootRuleSchema>;

const PointRuleSchema = z.object({
    id: z.literal("[PT]"),
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
                values: z.record(z.string(), z.number().optional()),
            })
        ),
    }),
});

export type StencilRule = z.infer<typeof StencilRuleSchema>;

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
]);

export type Rule = z.infer<typeof RuleSchema>;

export const PuzzleDataSchema = z.object({
    id: z.string(),
    difficulty: z.union([z.number(), z.literal("?")]),
    board: z.array(z.array(z.number()).length(9)).length(9),
    rules: z.array(RuleSchema),
    solving_state: SolvingStateSchema.optional()
});

export type PuzzleData = z.infer<typeof PuzzleDataSchema>;