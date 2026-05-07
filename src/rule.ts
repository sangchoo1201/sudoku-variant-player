import type {
    Position,
    Rule,
    SolvingState,
    SegmentRule,
    LinkRule,
    LotusRule,
    MetroRule,
    SequenceRule,
    QuantumRule,
    RangeRule,
    ReferenceRule,
    PrismRule,
    TemperatureRule,
    RootRule, PointRule, StencilRule, RuleID,
} from "./schema.ts";

type RuleCheckingResult = [true, []] | [false, Position[]];
type PureCheckingFunction = (solving_state: SolvingState) => RuleCheckingResult;
type RuleCheckingFunction<T extends Rule> = (solving_state: SolvingState, rule: T) => RuleCheckingResult;
type CoordinateMappingFunction = (i: number, j: number) => Position;

const square_numbers = new Set([16, 25, 36, 49, 64, 81]);
const prime_numbers = new Set([11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]);

function create_error_collector() {
    const errors: Position[] = [];
    const unique = new Set<number>();
    const encode = ([r, c]: Position) => r * 100 + c;

    return {
        add(pos: Position) {
            const key = encode(pos);
            if (unique.has(key)) return;

            unique.add(key);
            errors.push(pos);
        },

        add_all(positions: Position[]) {
            for (const pos of positions) {
                this.add(pos);
            }
        },

        result(): RuleCheckingResult {
            return errors.length ? [false, errors] : [true, []];
        }
    }
}

function generate_get_pos(direction: "ROW" | "COL", index: number): (x: number) => [number, number] {
    switch (direction) {
        case "ROW":
            return (x: number) => [index, x];
        case "COL":
            return (x: number) => [x, index];
    }
}

function generic_duplicate_check(
    solving_state: SolvingState, map: CoordinateMappingFunction
): RuleCheckingResult {
    const errors = create_error_collector();

    for (let i = 0; i < 9; i++) {
        let numbers = Object.fromEntries(
            Array.from({length: 9}, (_, i) => [i + 1, []])
        ) as Record<number, number[]>;
        for (let j = 0; j < 9; j++) {
            const [r, c] = map(i, j);
            const cell_data = solving_state.board[r][c];
            if (cell_data.number === null) continue;
            numbers[cell_data.number].push(j);
        }
        for (let n = 1; n <= 9; n++) {
            if (numbers[n].length >= 2) {
                numbers[n].forEach(j => errors.add(map(i, j)));
            }
        }
    }
    return errors.result();
}

function generic_pair_check(
    solving_state: SolvingState, neighbors: [number, number][]
): RuleCheckingResult {
    const get_neighbors = (r: number, c: number) => {
        return neighbors
            .map(([dr, dc]) => [r + dr, c + dc] as const)
            .filter(([r, c]) => r >= 0 && r < 9 && c >= 0 && c < 9);
    }

    const errors = create_error_collector();

    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const cell_data = solving_state.board[r][c];
            if (cell_data.number === null) continue;

            for (const [nr, nc] of get_neighbors(r, c)) {
                if (cell_data.number === solving_state.board[nr][nc].number) {
                    errors.add([r, c]);
                }
            }
        }
    }

    return errors.result();
}

const sudoku_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    [solving_state.board.every(
        row => row.every(
            cell => cell.number !== null
        )
    ), []];

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
        rule.render_state.regions[region][index]
    );

const distant_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_pair_check(solving_state, [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]);

const link_check: RuleCheckingFunction<LinkRule> = function (
    solving_state: SolvingState, rule: LinkRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const cell1 = solving_state.board[r1][c1];
        const cell2 = solving_state.board[r2][c2];
        if (cell1.number === null || cell2.number === null) continue;
        if (Math.abs(cell1.number - cell2.number) != 1) {
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        }
    }

    return errors.result();
}

const lotus_check: RuleCheckingFunction<LotusRule> = function (
    solving_state: SolvingState, rule: LotusRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c] of rule.render_state.cells) {
        const value = solving_state.board[r][c].number;
        if (value === null) continue;

        const neighbors: [number, number][] = ([[-1, 0], [0, -1], [1, 0], [0, 1]] as [number, number][])
            .map(([dr, dc]): [number, number] => [r + dr, c + dc])
            .filter(([nr, nc]) => nr >= 0 && nr < 9 && nc >= 0 && nc < 9);

        let has_greater = false, has_smaller = false;

        for (const [nr, nc] of neighbors) {
            const num = solving_state.board[nr][nc].number;
            if (num === null) continue;

            if (num > value) has_greater = true;
            if (num < value) has_smaller = true;

            if (has_greater && has_smaller) {
                errors.add([r, c]);
                break;
            }
        }
    }

    return errors.result();
}

const metro_check: RuleCheckingFunction<MetroRule> = function (
    solving_state: SolvingState, rule: MetroRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const metro of rule.render_state.metros) {
        const nums: number[] = [];

        for (const [r, c] of metro) {
            const value = solving_state.board[r][c].number;
            if (value === null) continue;
            nums.push(value);
        }

        if (new Set(nums).size !== nums.length) {
            errors.add_all(metro);
            continue;
        }

        const min = Math.min(...nums), max = Math.max(...nums);
        if (max - min + 1 > metro.length) {
            errors.add_all(metro);
        }
    }

    return errors.result();
}

const sequence_check: RuleCheckingFunction<SequenceRule> = function (
    solving_state: SolvingState, rule: SequenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, sequence] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);

        let j = 0;
        for (let i = 0; i < 9 && j < sequence.length; i++) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === null || v === sequence[j]) j++;
        }

        if (j !== sequence.length) {
            errors.add(get_pos(9));
        }
    }

    return errors.result();
}

const quantum_check: RuleCheckingFunction<QuantumRule> = function (
    solving_state: SolvingState, rule: QuantumRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, [a, b]] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const [r1, c1] = get_pos(a - 1), [r2, c2] = get_pos(b - 1);
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;

        const cond1 = v1 == b, cond2 = v2 == a;
        if (cond1 === cond2) {
            errors.add(get_pos(a - 1));
            errors.add(get_pos(b - 1));
            errors.add(get_pos(9));
        }
    }

    return errors.result();
}

const range_check: RuleCheckingFunction<RangeRule> = function (
    solving_state: SolvingState, rule: RangeRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, [distance]] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const one_pos: number[] = [], nine_pos: number[] = [];

        for (let i = 0; i < 9; i++) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === 1) one_pos.push(i);
            if (v === 9) nine_pos.push(i);
        }

        for (const one of one_pos) {
            for (const nine of nine_pos) {
                if (Math.abs(one - nine) === distance) continue;
                errors.add(get_pos(one));
                errors.add(get_pos(nine));
                errors.add(get_pos(9));
            }
        }
    }

    return errors.result();
}

const quad_check: PureCheckingFunction = function (
    solving_state: SolvingState,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const positions: Position[] = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]];
            let has_even = false, has_odd = false;

            for (const [i, j] of positions) {
                const v = solving_state.board[i][j].number;
                if (v === null) {
                    has_even = has_odd = true;
                    break;
                }
                if (v % 2 === 0) has_even = true;
                if (v % 2 === 1) has_odd = true;
            }

            if (!(has_even && has_odd)) {
                errors.add_all(positions);
            }
        }
    }

    return errors.result();
}

const reference_check: RuleCheckingFunction<ReferenceRule> = function (
    solving_state: SolvingState, rule: ReferenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index] of rule.render_state.lines) {
        const get_pos = generate_get_pos(direction, index);
        for (let i = 0; i < 9; i++) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === null) continue;

            const get_reference_pos = generate_get_pos(direction, v - 1);
            const [ref_r, ref_c] = get_reference_pos(i);
            const ref_v = solving_state.board[ref_r][ref_c].number;
            if (ref_v !== null && ref_v !== index + 1) {
                errors.add(get_pos(i));
                errors.add(get_reference_pos(i));
            }
        }
    }

    return errors.result();
}

const prism_check: RuleCheckingFunction<PrismRule> = function (
    solving_state: SolvingState, rule: PrismRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r1, c1, r2, c2, type] of rule.render_state.edges) {
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;

        const num = v1 * 10 + v2;
        if (!(type ? prime_numbers : square_numbers).has(num)) {
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        }
    }

    return errors.result();
}

const temperature_check: RuleCheckingFunction<TemperatureRule> = function (
    solving_state: SolvingState, rule: TemperatureRule
): RuleCheckingResult {
    const errors = create_error_collector();

    outer: for (const {cells, color} of rule.render_state.regions) {
        let sum = 0;
        for (const [r, c] of cells) {
            const value = solving_state.board[r][c].number;
            if (value === null) continue outer;
            sum += value;
        }
        if (sum <= 10 && color == 'blue') continue;
        if (sum == 15 && color == 'green') continue;
        if (sum >= 20 && color == 'red') continue;
        errors.add_all(cells);
    }

    return errors.result();
}

const root_check: RuleCheckingFunction<RootRule> = function (
    solving_state: SolvingState, rule: RootRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c, distance] of rule.render_state.cells) {
        const value = solving_state.board[r][c].number;
        if (value === null) continue;

        let has_exact = false, has_close = false;
        for (let nr = 0; nr < 9; nr++) {
            for (let nc = 0; nc < 9; nc++) {
                const d = (r - nr) ** 2 + (c - nc) ** 2;
                if (d > distance || d === 0) continue;
                const v = solving_state.board[nr][nc].number;
                if (d === distance && (v === null || v === value)) has_exact = true;
                if (d < distance && v === value) has_close = true;
            }
        }

        if (!has_exact || has_close) {
            errors.add([r, c]);
        }
    }

    return errors.result();
}

const point_check: RuleCheckingFunction<PointRule> = function (
    solving_state: SolvingState, rule: PointRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;

        if (v1 >= v2) {
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        }
    }

    return errors.result();
}

function match_piece(solving_state: SolvingState, positions: [Position, number][]): RuleCheckingResult {
    const max_row = positions.reduce((mx, [[r, _c], _v]) => Math.max(mx, r), 0);
    const max_col = positions.reduce((mx, [[_r, c], _v]) => Math.max(mx, c), 0);

    for (let r = 0; r < 9 - max_row; r++) {
        for (let c = 0; c < 9 - max_col; c++) {
            if (positions.every(
                ([[dr, dc], v]) =>
                    solving_state.board[r + dr][c + dc].number === v
            )) {
                return [false, positions.map(([[dr, dc], _]) => [r + dr, c + dc])];
            }
        }
    }
    return [true, []];
}

const stencil_check: RuleCheckingFunction<StencilRule> = function (
    solving_state: SolvingState, rule: StencilRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const {values} of rule.render_state.pieces) {
        const positions: [Position, number][] = [];
        let max_row = 0, max_col = 0;
        for (const key in values) {
            const [r, c] = key.split(',').map(Number);
            const v = values[key]!;
            max_row = Math.max(max_row, r);
            max_col = Math.max(max_col, c);
            positions.push([[r, c], v]);
        }

        const transforms: (([p, n]: [Position, number]) => [Position, number])[] = [
            ([[r, c], n]) => [[r, c], n],
            ([[r, c], n]) => [[max_row - r, c], n],
            ([[r, c], n]) => [[r, max_col - c], n],
            ([[r, c], n]) => [[max_row - r, max_col - c], n],
        ];

        const transpose: (b: boolean) => ([p, n]: [Position, number]) => [Position, number] =
            (b) =>
                ([[r, c], n]) => b ? [[c, r], n] : [[r, c], n];

        for (let i = 0; i < 8; i++) {
            const new_positions = positions.map(transforms[i % 4]);
            const [success, error] = match_piece(solving_state, new_positions.map(transpose(i >= 4)));
            if (!success) errors.add_all(error);
        }
    }

    return errors.result();
}

const rule_checks: Record<RuleID, (s: SolvingState, r: Rule) => RuleCheckingResult> = {
    "[Sudoku]": sudoku_check,
    "[R]": row_check,
    "[C]": column_check,
    "[B]": box_check,
    "[DT]": distant_check,
    "[QD]": quad_check,
    "[SG]": (s: SolvingState, r: Rule) => segment_check(s, r as SegmentRule),
    "[LK]": (s: SolvingState, r: Rule) => link_check(s, r as LinkRule),
    "[LO]": (s: SolvingState, r: Rule) => lotus_check(s, r as LotusRule),
    "[MR]": (s: SolvingState, r: Rule) => metro_check(s, r as MetroRule),
    "[RF]": (s: SolvingState, r: Rule) => reference_check(s, r as ReferenceRule),
    "[PR]": (s: SolvingState, r: Rule) => prism_check(s, r as PrismRule),
    "[QT]": (s: SolvingState, r: Rule) => quantum_check(s, r as QuantumRule),
    "[RG]": (s: SolvingState, r: Rule) => range_check(s, r as RangeRule),
    "[SQ]": (s: SolvingState, r: Rule) => sequence_check(s, r as SequenceRule),
    "[TM]": (s: SolvingState, r: Rule) => temperature_check(s, r as TemperatureRule),
    "[RT]": (s: SolvingState, r: Rule) => root_check(s, r as RootRule),
    "[PT]": (s: SolvingState, r: Rule) => point_check(s, r as PointRule),
    "[ST]": (s: SolvingState, r: Rule) => stencil_check(s, r as StencilRule),
} as const;

export function check_all(
    solving_state: SolvingState, rules: Rule[]
): [boolean, Partial<Record<RuleID, Position[]>>] {
    let correct = true;
    const errors: Partial<Record<RuleID, Position[]>> = {};

    for (const rule of rules) {
        const id = rule.id;
        const [c, e] = rule_checks[id](solving_state, rule);
        if (!c) correct = false;
        errors[id] = e;
    }

    return [correct, errors];
}
