import {
    type Position,
    type Rule,
    type SegmentRule,
    type SolvingState,
    type LinkRule,
    type LotusRule, type MetroRule
} from "./schema.ts";

type RuleCheckingResult = [true, []] | [false, Position[]];
type PureCheckingFunction = (solving_state: SolvingState) => RuleCheckingResult;
type RuleCheckingFunction<T extends Rule> = (solving_state: SolvingState, rule: T) => RuleCheckingResult;
type CoordinateMappingFunction = (i: number, j: number) => Position;

const generic_duplicate_check = function (
    solving_state: SolvingState, map: CoordinateMappingFunction
): RuleCheckingResult {
    let errors: Position[] = [];
    for (let i = 0; i < 9; i++) {
        let numbers = Object.fromEntries(
            Array.from({ length: 9 }, (_, i) => [i + 1, []])
        ) as Record<number, number[]>;
        for (let j = 0; j < 9; j++) {
            const [r, c] = map(i, j);
            const cell_data = solving_state.board[r][c];
            if (cell_data.number === null) continue;
            numbers[cell_data.number].push(j);
        }
        for (let n = 1; n <= 9; n++) {
            if (numbers[n].length >= 2) {
                numbers[n].forEach(j => errors.push(map(i, j)));
            }
        }
    }
    return errors.length ? [false, errors] : [true, []]
};

const row_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (row, index) => [row, index]);

const column_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (col, index) => [index, col]);

const box_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (box, index) =>
        [Math.floor(box / 3) * 3 + Math.floor(index / 3), (box % 3) * 3 + (index % 3)]
    );

const segment_check: RuleCheckingFunction<SegmentRule> = (solving_state: SolvingState, rule: SegmentRule): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (region, index) =>
        rule.params.regions[region][index]
    );

const generic_pair_check = function (
    solving_state: SolvingState, neighbors: [number, number][]
): RuleCheckingResult {
    const get_neighbors = (r: number, c: number) => {
        return neighbors
            .map(([dr, dc]) => [r + dr, c + dc] as const)
            .filter(([r, c]) => r >= 0 && r < 9 && c >= 0 && c < 9);
    }

    let errors: Position[] = [];

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell_data = solving_state.board[r][c];
            if (cell_data.number === null) continue;

            for (const [nr, nc] of get_neighbors(r, c)) {
                if (cell_data.number === solving_state.board[nr][nc].number) {
                    errors.push([r, c]);
                }
            }
        }
    }

    return errors.length ? [false, errors] : [true, []];
}

const distant_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_pair_check(solving_state, [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);

const link_check: RuleCheckingFunction<LinkRule> = function (
    solving_state: SolvingState, rule: LinkRule
): RuleCheckingResult {
    let errors: Position[] = []
    for (const [[r1, c1], [r2, c2]] of rule.params.edges) {
        const cell1 = solving_state.board[r1][c1];
        const cell2 = solving_state.board[r2][c2];
        if (cell1.number === null || cell2.number === null) continue;
        if (Math.abs(cell1.number - cell2.number) != 1) {
            errors.push([r1, c1]);
            errors.push([r2, c2]);
        }
    }

    return errors.length ? [false, errors] : [true, []];
}

const lotus_check: RuleCheckingFunction<LotusRule> = function (
    solving_state: SolvingState, rule: LotusRule
): RuleCheckingResult {
    let errors: Position[] = []
    for (const [r, c] of rule.params.cells) {
        const value = solving_state.board[r][c].number;
        if (value === null) continue;

        const neighbors: [number, number][] = ([[-1, 0], [0, -1], [1, 0], [0, 1]] as [number, number][])
            .map(([dr, dc]): [number, number] => [r + dr, c + dc])
            .filter(([nr, nc]) => nr >= 0 && nr < 9 && nc >= 0 && nc < 9);

        let has_greater = false;
        let has_smaller = false;

        for (const [nr, nc] of neighbors) {
            const num = solving_state.board[nr][nc].number;
            if (num === null) continue;

            if (num > value) has_greater = true;
            if (num < value) has_smaller = true;

            if (has_greater && has_smaller) {
                errors.push([r, c]);
                break;
            }
        }
    }

    return errors.length ? [false, errors] : [true, []];
}

const metro_check: RuleCheckingFunction<MetroRule> = function (
    solving_state: SolvingState, rule: MetroRule
): RuleCheckingResult {
    let errors: Position[] = []
    for (const metro of rule.params.metros) {
        const nums: number[] = [];

        for (const [r, c] of metro) {
            const value = solving_state.board[r][c].number;
            if (value === null) continue;
            nums.push(value);
        }

        if (new Set(nums).size !== nums.length) {
            errors.push(...metro);
            continue;
        }

        const min = Math.min(...nums);
        const max = Math.max(...nums);
        if (max - min + 1 > metro.length) {
            errors.push(...metro);
        }
    }

    return errors.length ? [false, errors] : [true, []];
}
