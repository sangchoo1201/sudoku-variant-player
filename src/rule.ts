import {
    type Position,
    type Rule,
    type SolvingState,
    type SegmentRule,
    type LinkRule,
    type LotusRule,
    type MetroRule,
    type SequenceRule,
    type QuantumRule,
    type RangeRule,
    type ReferenceRule,
    type PrismRule,
    type TemperatureRule,
    type RootRule,
    type PointRule,
    type StencilRule,
    type RuleID,
    type VectorRule,
    type StreamRule,
    type PairRule,
    type InversionRule,
    type BoardCoord,
    type Direction,
    type Digit,
    board_coords, digits, position_generator, type PositionExpanded, type Side,
} from "./schema.ts";

type RuleCheckingResult = [true, []] | [false, PositionExpanded[]];
type PureCheckingFunction = (solving_state: SolvingState) => RuleCheckingResult;
type RuleCheckingFunction<T extends Rule> = (solving_state: SolvingState, rule: T) => RuleCheckingResult;
type CoordinateMappingFunction = (i: number, j: number) => Position;

function is_coord(n: number): n is BoardCoord {
    return Number.isInteger(n) && 0 <= n && n < 9;
}

function digit_to_coord(digit: Digit): BoardCoord {
    return digit - 1 as BoardCoord;
}

function create_error_collector() {
    const errors: PositionExpanded[] = [];
    const unique = new Set<string>();
    const encode = ([r, c]: Position) => `${r},${c}`;

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

        add_side(side: Side, index: BoardCoord) {
            const key = `${side},${index}`;
            if (unique.has(key)) return;

            unique.add(key);
            errors.push([side, index]);
        },

        add_direction(direction: Direction, index: BoardCoord) {
            switch (direction) {
                case "ROW":
                    this.add_side("right", index);
                    break;
                case "COL":
                    this.add_side("bottom", index);
                    break;
            }
        },

        result(): RuleCheckingResult {
            return errors.length ? [false, errors] : [true, []];
        }
    }
}

function generate_get_pos(direction: Direction, index: BoardCoord): (x: BoardCoord) => Position {
    switch (direction) {
        case "ROW":
            return (x: BoardCoord) => [index, x];
        case "COL":
            return (x: BoardCoord) => [x, index];
    }
}

function generic_duplicate_check(
    solving_state: SolvingState, map: CoordinateMappingFunction
): RuleCheckingResult {
    const errors = create_error_collector();

    for (let i = 0; i < 9; i++) {
        let numbers = digits.reduce(
            (acc, d) => {
                acc[d] = [];
                return acc;
            },
            {} as Record<Digit, number[]>
        );
        for (let j = 0; j < 9; j++) {
            const [r, c] = map(i, j);
            const cell_data = solving_state.board[r][c];
            if (cell_data.number === null) continue;
            numbers[cell_data.number].push(j);
        }
        for (const n of digits) {
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

    for (const [r, c] of position_generator()){
        const cell_data = solving_state.board[r][c];
        if (cell_data.number === null) continue;

        for (const [nr, nc] of get_neighbors(r, c)) {
            if (cell_data.number === solving_state.board[nr][nc].number) {
                errors.add([r, c]);
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
    generic_duplicate_check(solving_state, (row, index) => [row, index] as Position);

const column_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (col, index) => [index, col] as Position);

const box_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (box, index) =>
        [(Math.floor(box / 3) * 3 + Math.floor(index / 3)), (box % 3) * 3 + (index % 3)] as Position
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

        let has_greater = false, has_smaller = false, has_same = false;

        for (const [nr, nc] of neighbors) {
            const num = solving_state.board[nr][nc].number;
            if (num === null) continue;

            if (num > value) has_greater = true;
            if (num < value) has_smaller = true;
            if (num === value) has_same = true;

            if (has_greater && has_smaller || has_same) {
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
        for (const i of board_coords) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === null || v === sequence[j]) j++;
            if (j >= sequence.length) break;
        }

        if (j !== sequence.length) {
            errors.add_direction(direction, index);
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
        const [r1, c1] = get_pos(digit_to_coord(a)), [r2, c2] = get_pos(digit_to_coord(b));
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;

        const cond1 = v1 == b, cond2 = v2 == a;
        if (cond1 === cond2) {
            errors.add(get_pos(digit_to_coord(a)));
            errors.add(get_pos(digit_to_coord(b)));
            errors.add_direction(direction, index);
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
        const one_pos: BoardCoord[] = [], nine_pos: BoardCoord[] = [];

        for (const i of board_coords) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === 1) one_pos.push(i);
            if (v === 9) nine_pos.push(i);
        }

        function can_be([r, c]: Position, target: Digit) {
            const value = solving_state.board[r][c].number;
            return value === null || value === target;
        }
        for (const one of one_pos) {
            const i1 = one - distance, i2 = one + distance;
            if (is_coord(i1) && can_be(get_pos(i1), 9)) continue;
            if (is_coord(i2) && can_be(get_pos(i2), 9)) continue;
            errors.add(get_pos(one));
            errors.add_direction(direction, index);
        }
        for (const nine of nine_pos) {
            const i1 = nine - distance, i2 = nine + distance;
            if (is_coord(i1) && can_be(get_pos(i1), 1)) continue;
            if (is_coord(i2) && can_be(get_pos(i2), 1)) continue;
            errors.add(get_pos(nine));
            errors.add_direction(direction, index);
        }

        for (const one of one_pos) {
            for (const nine of nine_pos) {
                if (Math.abs(one - nine) === distance) continue;
                errors.add(get_pos(one));
                errors.add(get_pos(nine));
                errors.add_direction(direction, index);
            }
        }
    }

    return errors.result();
}

const quad_check: PureCheckingFunction = function (
    solving_state: SolvingState,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c] of position_generator([0, 0], [7, 7])) {
        const positions: Position[] = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] as Position[];
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

    return errors.result();
}

const reference_check: RuleCheckingFunction<ReferenceRule> = function (
    solving_state: SolvingState, rule: ReferenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index] of rule.render_state.lines) {
        const get_pos = generate_get_pos(direction, index);
        for (const i of board_coords) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === null) continue;

            const get_reference_pos = generate_get_pos(direction, digit_to_coord(v));
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

const square_numbers = new Set([16, 25, 36, 49, 64, 81]);
const prime_numbers = new Set([11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]);

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

    for (const {cells, color} of rule.render_state.regions) {
        let sum = 0;
        let remaining = 3;
        for (const [r, c] of cells) {
            const value = solving_state.board[r][c].number;
            if (value === null) continue;
            sum += value;
            remaining--;
        }
        if ((sum + remaining) <= 10 && color == 'blue') continue;
        if (remaining <= Math.abs(15 - sum) && Math.abs(15 - sum) <= remaining * 9 && color == 'green') continue;
        if ((sum + remaining * 9) >= 20 && color == 'red') continue;
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

function match_piece(solving_state: SolvingState, positions: [Position, Digit][]): Position[] {
    const max_row = positions.reduce(
        (mx, [[r, _c], _v]): BoardCoord => Math.max(mx, r) as BoardCoord,
        0 as BoardCoord
    );
    const max_col = positions.reduce(
        (mx, [[_r, c], _v]): BoardCoord => Math.max(mx, c) as BoardCoord,
        0 as BoardCoord
    );

    for (const [r, c] of position_generator([0, 0], [max_row, max_col])) {
        if (positions.every(
            ([[dr, dc], v]) =>
                solving_state.board[r + dr][c + dc].number === v
        )) {
            return positions.map(([[dr, dc], _]: [Position, Digit]): Position => [r + dr, c + dc] as Position);
        }
    }
    return [];
}

const stencil_check: RuleCheckingFunction<StencilRule> = function (
    solving_state: SolvingState, rule: StencilRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const {values} of rule.render_state.pieces) {
        const positions: [Position, Digit][] = [];
        let max_row: BoardCoord = 0, max_col: BoardCoord = 0;
        for (const key in values) {
            const [r, c] = key.split(',').map(Number) as Position;
            const v = values[key]!;
            max_row = Math.max(max_row, r) as BoardCoord;
            max_col = Math.max(max_col, c) as BoardCoord;
            positions.push([[r, c], v]);
        }

        const transforms: (([p, n]: [Position, Digit]) => [Position, Digit])[] = [
            ([[r, c], n]) => [[r, c], n],
            ([[r, c], n]) => [[max_row - r, c] as Position, n],
            ([[r, c], n]) => [[r, max_col - c] as Position, n],
            ([[r, c], n]) => [[max_row - r, max_col - c] as Position, n],
        ];

        const transpose: (b: boolean) => ([p, n]: [Position, Digit]) => [Position, Digit] =
            (b) => ([[r, c], n]) => b ? [[c, r], n] : [[r, c], n];

        for (let i = 0; i < 8; i++) {
            const new_positions = positions.map(transforms[i % 4]);
            errors.add_all(match_piece(solving_state, new_positions.map(transpose(i >= 4))));
        }
    }

    return errors.result();
}

const direction_map: Record<"L" | "R" | "U" | "D", [number, number]> = {
    "L": [0, -1],
    "R": [0, 1],
    "U": [-1, 0],
    "D": [1, 0],
};

const vector_check: RuleCheckingFunction<VectorRule> = function (
    solving_state: SolvingState, rule: VectorRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c, direction] of rule.render_state.arrows) {
        const v = solving_state.board[r][c].number;
        if (v === null) continue;
        const [dr, dc] = direction_map[direction];
        const nr = r + dr * v, nc = c + dc * v;
        if (!(is_coord(nr) && is_coord(nc))) {
            errors.add([r, c]);
            continue;
        }
        const other_v = solving_state.board[nr][nc].number;
        if (other_v !== null && other_v !== 9) {
            errors.add([r, c]);
            errors.add([nr, nc]);
        }
    }

    return errors.result();
}

const stream_check: RuleCheckingFunction<StreamRule> = function (
    solving_state: SolvingState, rule: StreamRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const stream of rule.render_state.streams) {
        let remainder: number | null = null;
        for (const [r, c] of stream) {
            if (remainder !== null) remainder ^= 1;
            const v = solving_state.board[r][c].number;
            if (v === null) continue;
            if (remainder === null) {
                remainder = v % 2;
            } else if (v % 2 !== remainder) {
                errors.add_all(stream);
                break;
            }
        }
    }

    return errors.result();
}

const pair_check: RuleCheckingFunction<PairRule> = function (
    solving_state: SolvingState, rule: PairRule
): RuleCheckingResult {
    const errors = create_error_collector();

    const pairs: Record<number, [Position, Position]> = {};
    for (const [[r1, c1], [r2, c2]] of rule.render_state.dominoes) {
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;
        const n = Math.min(v1, v2) * 10 + Math.max(v1, v2);
        if (n in pairs) {
            errors.add_all(pairs[n]);
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        } else {
            pairs[n] = [[r1, c1], [r2, c2]];
        }
    }

    return errors.result();
}

const inversion_check: RuleCheckingFunction<InversionRule> = function (
    solving_state: SolvingState, rule: InversionRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const line of rule.render_state.lines) {
        let min_num = 0;
        let inversion_count = 0;
        let can_invert = false;

        const nums = line.map(([r, c]) => solving_state.board[r][c].number);
        const len = nums.length;
        for (let i = 0; i < nums.length; i++) {
            const v = nums[i];
            if (v === null) {
                if (!((i === len - 1 || nums[i + 1] === 9) && (i === 0 || nums[i - 1] === 1))) can_invert = true;
                continue;
            }
            if (v < min_num) inversion_count++;
            min_num = v;
        }

        if (inversion_count >= 2 || inversion_count === 0 && !can_invert) {
            errors.add_all(line);
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
    "[PO]": (s: SolvingState, r: Rule) => point_check(s, r as PointRule),
    "[ST]": (s: SolvingState, r: Rule) => stencil_check(s, r as StencilRule),
    "[VT]": (s: SolvingState, r: Rule) => vector_check(s, r as VectorRule),
    "[SR]": (s: SolvingState, r: Rule) => stream_check(s, r as StreamRule),
    "[PA]": (s: SolvingState, r: Rule) => pair_check(s, r as PairRule),
    "[IV]": (s: SolvingState, r: Rule) => inversion_check(s, r as InversionRule),
} as const;

export function check_all(
    solving_state: SolvingState, rules: Rule[]
): [boolean, Partial<Record<RuleID, PositionExpanded[]>>] {
    let correct = true;
    const errors: Partial<Record<RuleID, PositionExpanded[]>> = {};

    for (const rule of rules) {
        const id = rule.id;
        const [c, e] = rule_checks[id](solving_state, rule);
        if (!c) correct = false;
        errors[id] = e;
    }

    return [correct, errors];
}
