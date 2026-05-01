import { z } from "zod";

const PositionSchema = z.tuple([z.number(), z.number()]);

const CellStateSchema = z.object({
    number: z.number().nullable(),
    corner: z.record(z.number(), z.boolean()),
    center: z.record(z.number(), z.boolean()),
});

const BoardChangeSchema = z.array(
    z.object({
        pos: PositionSchema,
        before: CellStateSchema,
        after: CellStateSchema,
    })
);

const SolvingStateSchema = z.object({
    board: z.array(z.array(CellStateSchema).min(1)).min(1),
    undo: z.array(BoardChangeSchema),
    redo: z.array(BoardChangeSchema),
});

const SudokuRule = z.object({
    id: z.literal("[Sudoku]"),
    params: z.object({}),
});

const RowRule = z.object({
    id: z.literal("[R]"),
    params: z.object({}),
});

const ColumnRule = z.object({
    id: z.literal("[C]"),
    params: z.object({}),
});

const BoxRule = z.object({
    id: z.literal("[B]"),
    params: z.object({}),
});

const DistantRule = z.object({
    id: z.literal("[DT]"),
    params: z.object({}),
});

const SegmentRule = z.object({
    id: z.literal("[SG]"),
    params: z.object({
        regions: z.array(z.array(PositionSchema)),
    }),
});

const LinkRule = z.object({
    id: z.literal("[LK]"),
    params: z.object({
        edges: z.tuple([PositionSchema, PositionSchema]),
    }),
});

const LotusRule = z.object({
    id: z.literal("[LO]"),
    params: z.object({
        cells: z.array(PositionSchema),
    }),
});

const MetroRule = z.object({
    id: z.literal("[MR]"),
    params: z.object({
        metros: z.array(z.array(PositionSchema)),
    }),
});

const SequenceRule = z.object({
    id: z.literal("[SQ]"),
    params: z.object({
        hints: z.array(
            z.tuple([
                z.enum(["row", "col"]),
                z.number(),
                z.array(z.number())
            ])
        ),
    }),
});

const RuleSchema = z.discriminatedUnion("id", [
    SudokuRule,
    RowRule,
    ColumnRule,
    BoxRule,
    DistantRule,
    SegmentRule,
    LinkRule,
    LotusRule,
    MetroRule,
    SequenceRule,
]);

export const PuzzleDataSchema = z.object({
    id: z.string(),
    difficulty: z.number(),
    board: z.array(z.array(z.number()).min(1)).min(1),
    rules: z.array(RuleSchema),
    solving_state: SolvingStateSchema.optional()
});

export type PuzzleData = z.infer<typeof PuzzleDataSchema>;