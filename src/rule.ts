import {
    type BoardCoord, type Position, type Digit,
    type Direction, type DirectionExtended, type Side,
    type SolvingState,
    type Rule, type RuleID,
    type SegmentRule, type LinkRule, type LotusRule, type MetroRule, type SequenceRule,
    type QuantumRule, type RangeRule, type ReferenceRule, type PrismRule, type TemperatureRule,
    type RootRule, type PointRule, type StencilRule, type VectorRule, type StreamRule,
    type PairRule, type InversionRule, type PositionExtended, type TrailRule, type ProductRule,
    type BridgeRule, type ReflexRule, type AquariumRule, type MetaRule, type LinkPrimeRule,
    type PrismPrimeRule, type LotusPrimeRule, type RootPrimeRule, type SequencePrimeRule, type RangePrimeRule,
    type TrailPrimeRule, type SegmentPrimeRule,
    board_coords, digits,
    is_coord, is_pos, is_digit, generate_positions, type BoxPrimeRule, type VectorPrimeRule,
} from "./schema.ts";
import {trail_sat_solve} from "./sat.ts";

type RuleCheckingResult = [true, []] | [false, PositionExtended[]];
type PureCheckingFunction = (board_getter: BoardGetter) => RuleCheckingResult;
type RuleCheckingFunction<T extends Rule, A extends unknown[] = []> =
    (board_getter: BoardGetter, rule: T, ...args: A) => RuleCheckingResult;
type CoordinateMappingFunction = (i: number, j: number) => Position;
export type BoardGetter = (p: Position) => Digit | null;

const adjacent = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
const king_adjacent = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;

const encode = ([r, c]: Position) => `${r},${c}`;

const digit_to_coord = (digit: Digit) => digit - 1 as BoardCoord;

const no_error: RuleCheckingResult = [true, []];

function create_error_collector() {
    const errors: PositionExtended[] = [];
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

        add_direction(direction: DirectionExtended, index: BoardCoord) {
            switch (direction) {
                case "ROW_LEFT":
                    this.add_side("left", index);
                    break;
                case "ROW":
                    this.add_side("right", index);
                    break;
                case "COL_TOP":
                    this.add_side("top", index);
                    break;
                case "COL":
                    this.add_side("bottom", index);
                    break;
            }
        },

        result(): RuleCheckingResult {
            return errors.length ? [false, errors] : no_error;
        }
    }
}

function is_board_filled(board_getter: BoardGetter): board_getter is (p: Position) => Digit {
    for (const pos of generate_positions()) {
        if (board_getter(pos) === null) return false;
    }
    return true;
}

const get_neighbors = (adjacent: readonly (readonly [number, number])[], [r, c]: Position) =>
    adjacent.map(([dr, dc]) => [r + dr, c + dc] as [number, number]).filter(is_pos);

const generate_board_getter = (solving_state: SolvingState) =>
    ([r, c]: Position) => solving_state.board[r][c].number;

function generate_record<K extends PropertyKey, V>(
    keys: readonly K[], value_generator: () => V
): Record<K, V> {
    return keys.reduce(
        (acc, k) => {
            acc[k] = value_generator();
            return acc;
        },
        {} as Record<K, V>
    );
}

function generate_get_pos(direction: Direction, index: BoardCoord): (x: BoardCoord) => Position {
    switch (direction) {
        case "ROW":
            return (x: BoardCoord) => [index, x];
        case "COL":
            return (x: BoardCoord) => [x, index];
    }
}

function generate_get_pos_extended(direction: DirectionExtended, index: BoardCoord): (x: BoardCoord) => Position {
    switch (direction) {
        case "ROW_LEFT":
            return (x: BoardCoord) => [index, x];
        case "ROW":
            return (x: BoardCoord) => [index, (8 - x) as BoardCoord];
        case "COL_TOP":
            return (x: BoardCoord) => [x, index];
        case "COL":
            return (x: BoardCoord) => [(8 - x) as BoardCoord, index];
    }
}

function generate_bfs(visited: Set<string>, condition: (p: Position) => boolean): (p: Position) => Position[] {
    function bfs(start: Position): Position[] {
        const queue: Position[] = [start];
        let head = 0;
        visited.add(encode(start));

        while (head < queue.length) {
            const pos = queue[head++];
            for (const new_pos of get_neighbors(adjacent, pos)) {
                if (visited.has(encode(new_pos))) continue;
                if (condition(new_pos)) {
                    queue.push(new_pos);
                    visited.add(encode(new_pos));
                }
            }
        }

        return queue;
    }

    return bfs;
}

function generic_duplicate_check(
    board_getter: BoardGetter, map: CoordinateMappingFunction, [a, b]: [number, number] = [9, 9]
): RuleCheckingResult {
    const errors = create_error_collector();

    for (let i = 0; i < a; i++) {
        let numbers = generate_record<Digit, number[]>(digits, () => []);
        for (let j = 0; j < b; j++) {
            const v = board_getter(map(i, j));
            if (v === null) continue;
            numbers[v].push(j);
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
    board_getter: BoardGetter, adjacent: readonly (readonly [number, number])[]
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const pos of generate_positions()) {
        const v = board_getter(pos);
        if (v === null) continue;

        for (const new_pos of get_neighbors(adjacent, pos)) {
            if (v === board_getter(new_pos)) {
                errors.add(pos);
            }
        }
    }

    return errors.result();
}

const sudoku_check: PureCheckingFunction = (board_getter: BoardGetter): RuleCheckingResult => {
    for (const pos of generate_positions()) {
        if (board_getter(pos) === null) return [false, []];
    }
    return no_error;
}

const row_check: PureCheckingFunction = (board_getter: BoardGetter): RuleCheckingResult =>
    generic_duplicate_check(board_getter, (row, index) => [row, index] as Position);

const column_check: PureCheckingFunction = (board_getter: BoardGetter): RuleCheckingResult =>
    generic_duplicate_check(board_getter, (col, index) => [index, col] as Position);

const box_check: PureCheckingFunction = (board_getter: BoardGetter): RuleCheckingResult =>
    generic_duplicate_check(board_getter, (box, index) =>
        [(Math.floor(box / 3) * 3 + Math.floor(index / 3)), (box % 3) * 3 + (index % 3)] as Position
    );

const segment_check: RuleCheckingFunction<SegmentRule> = (board_getter: BoardGetter, rule: SegmentRule): RuleCheckingResult =>
    generic_duplicate_check(board_getter, (region, index) => rule.render_state.regions[region][index]);

const segment_prime_check: RuleCheckingFunction<SegmentPrimeRule> = (board_getter: BoardGetter, rule: SegmentPrimeRule): RuleCheckingResult =>
    generic_duplicate_check(board_getter, (region, index) => rule.render_state.regions[region][index], [16, 5]);

const distant_check: PureCheckingFunction = (board_getter: BoardGetter): RuleCheckingResult =>
    generic_pair_check(board_getter, king_adjacent);

const link_check: RuleCheckingFunction<LinkRule> = function (
    board_getter: BoardGetter, rule: LinkRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [p1, p2] of rule.render_state.edges) {
        const v1 = board_getter(p1), v2 = board_getter(p2);
        if (v1 === null || v2 === null) continue;
        if (Math.abs(v1 - v2) != 1) {
            errors.add(p1);
            errors.add(p2);
        }
    }

    return errors.result();
}

const lotus_check: RuleCheckingFunction<LotusRule> = function (
    board_getter: BoardGetter, rule: LotusRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const pos of rule.render_state.cells) {
        const v = board_getter(pos);
        if (v === null) continue;

        let has_greater = false, has_smaller = false, has_same = false;
        for (const new_pos of get_neighbors(adjacent, pos)) {
            const num = board_getter(new_pos);
            if (num === null) continue;

            if (num > v) has_greater = true;
            if (num < v) has_smaller = true;
            if (num === v) has_same = true;

            if (has_greater && has_smaller || has_same) {
                errors.add(pos);
                break;
            }
        }
    }

    return errors.result();
}

const metro_check: RuleCheckingFunction<MetroRule> = function (
    board_getter: BoardGetter, rule: MetroRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const metro of rule.render_state.metros) {
        const nums: number[] = [];
        const set = new Set<string>();

        for (const pos of metro) {
            if (set.has(encode(pos))) continue;
            set.add(encode(pos));
            const v = board_getter(pos);
            if (v === null) continue;
            nums.push(v);
        }

        if (new Set(nums).size !== nums.length) {
            errors.add_all(metro);
            continue;
        }

        const min = Math.min(...nums), max = Math.max(...nums);
        if (max - min + 1 > set.size) {
            errors.add_all(metro);
        }
    }

    return errors.result();
}

const sequence_check: RuleCheckingFunction<SequenceRule> = function (
    board_getter: BoardGetter, rule: SequenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, sequence] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const set = new Set<Digit>(sequence);

        const compressed: [Digit | null, number][] = [];
        for (const x of sequence) {
            const last = compressed[compressed.length - 1];

            if (last === undefined || last[0] !== x) {
                compressed.push([x, 1]);
            } else {
                last[1]++;
            }
        }

        const pattern = new RegExp('^' + compressed.map(([digit, amount]) => `[0${digit}]{${amount},}`).join('') + '$');

        let str = "";
        for (const i of board_coords) {
            const v = board_getter(get_pos(i));
            if (v === null) {
                str += "0";
            } else if (set.has(v)) {
                str += v.toString();
            }
        }

        if (!pattern.test(str)) {
            errors.add_direction(direction, index);
        }
    }

    return errors.result();
}

const quantum_check: RuleCheckingFunction<QuantumRule> = function (
    board_getter: BoardGetter, rule: QuantumRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, [a, b]] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const v1 = board_getter(get_pos(digit_to_coord(a)));
        const v2 = board_getter(get_pos(digit_to_coord(b)))
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
    board_getter: BoardGetter, rule: RangeRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, [distance]] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const one_pos: BoardCoord[] = [], nine_pos: BoardCoord[] = [];

        for (const i of board_coords) {
            const v = board_getter(get_pos(i));
            if (v === 1) one_pos.push(i);
            if (v === 9) nine_pos.push(i);
        }

        function can_be(pos: Position, target: Digit) {
            const v = board_getter(pos);
            return v === null || v === target;
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
    board_getter: BoardGetter,
): RuleCheckingResult {
    const errors = create_error_collector();
    const quad_adjacent = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;

    for (const pos of generate_positions([0, 0], [7, 7])) {
        const quad = get_neighbors(quad_adjacent, pos);
        let has_even = false, has_odd = false;
        for (const new_pos of quad) {
            const v = board_getter(new_pos);
            if (v === null) {
                has_even = has_odd = true;
                break;
            }
            if (v % 2 === 0) has_even = true;
            if (v % 2 === 1) has_odd = true;
        }

        if (!(has_even && has_odd)) {
            errors.add_all(quad);
        }
    }

    return errors.result();
}

const reference_check: RuleCheckingFunction<ReferenceRule> = function (
    board_getter: BoardGetter, rule: ReferenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index] of rule.render_state.lines) {
        const get_pos = generate_get_pos(direction, index);
        for (const i of board_coords) {
            const v = board_getter(get_pos(i));
            if (v === null) continue;

            const get_reference_pos = generate_get_pos(direction, digit_to_coord(v));
            const ref_v = board_getter(get_reference_pos(i));
            if (ref_v !== null && ref_v !== index + 1) {
                errors.add(get_pos(i));
                errors.add(get_reference_pos(i));
            }
        }
    }

    return errors.result();
}

const square_first = new Set([1, 2, 3, 4, 6, 8]);
const square_second = new Set([1, 4, 5, 6, 9]);
const prime_second = new Set([1, 3, 7, 9]);
const square_numbers = new Set([16, 25, 36, 49, 64, 81]);
const prime_numbers = new Set([11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]);

const prism_check: RuleCheckingFunction<PrismRule> = function (
    board_getter: BoardGetter, rule: PrismRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r1, c1, r2, c2, type] of rule.render_state.edges) {
        const v1 = board_getter([r1, c1]);
        const v2 = board_getter([r2, c2]);

        if (v1 === null && v2 === null) continue;
        if (v1 !== null && v2 === null) {
            if (type ? true : square_first.has(v1)) continue;
        }
        if (v1 === null && v2 !== null) {
            if (type ? prime_second.has(v2) : square_second.has(v2)) continue;
        }
        if (v1 !== null && v2 !== null) {
            const num = v1 * 10 + v2;
            if (type ? prime_numbers.has(num): square_numbers.has(num)) continue;
        }
        errors.add([r1, c1]);
        errors.add([r2, c2]);
    }

    return errors.result();
}

const temperature_check: RuleCheckingFunction<TemperatureRule> = function (
    board_getter: BoardGetter, rule: TemperatureRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const {cells, color} of rule.render_state.regions) {
        let sum = 0;
        let remaining = 3;
        for (const pos of cells) {
            const v = board_getter(pos);
            if (v === null) continue;
            sum += v;
            remaining--;
        }
        if ((sum + remaining) <= 10 && color == 'blue') continue;
        if (remaining <= Math.abs(15 - sum) && Math.abs(15 - sum) <= remaining * 9 && color == 'green') continue;
        if ((sum + remaining * 9) >= 20 && color == 'red') continue;
        errors.add_all(cells);
    }

    return errors.result();
}

const root_check: RuleCheckingFunction<RootRule, [boolean?]> = function (
    board_getter: BoardGetter, rule: RootRule, prime: boolean = false,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c, distance] of rule.render_state.cells) {
        const v = board_getter([r, c]);
        if (v === null) continue;

        let has_exact = false, has_close = false, has_far = false;
        for (const [nr, nc] of generate_positions()) {
            const d = (r - nr) ** 2 + (c - nc) ** 2;
            if (d === 0) continue;
            const nv = board_getter([nr, nc]);
            if (d > distance && nv === v) has_far = true;
            if (d === distance && (nv === null || nv === v)) has_exact = true;
            if (d < distance && nv === v) has_close = true;
        }

        if (!has_exact || (prime ? has_far : has_close)) {
            errors.add([r, c]);
        }
    }

    return errors.result();
}

const point_check: RuleCheckingFunction<PointRule> = function (
    board_getter: BoardGetter, rule: PointRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [p1, p2] of rule.render_state.edges) {
        const v1 = board_getter(p1), v2 = board_getter(p2);
        if (v1 === null || v2 === null) continue;

        if (v1 >= v2) {
            errors.add(p1);
            errors.add(p2);
        }
    }

    return errors.result();
}

function match_piece(board_getter: BoardGetter, positions: [Position, Digit][]): Position[] {
    for (const [r, c] of generate_positions()) {
        if (positions.every(
            ([[dr, dc], v]) => {
                const new_pos = [r + dr, c + dc] as [number, number];
                return is_pos(new_pos) && board_getter(new_pos) === v;
            }
        )) {
            return positions.map(([[dr, dc], _]) => [r + dr, c + dc] as Position);
        }
    }
    return [];
}

const stencil_check: RuleCheckingFunction<StencilRule> = function (
    board_getter: BoardGetter, rule: StencilRule
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
            errors.add_all(match_piece(board_getter, new_positions.map(transpose(i >= 4))));
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

const vector_check: RuleCheckingFunction<VectorRule, [boolean?]> = function (
    board_getter: BoardGetter, rule: VectorRule, prime: boolean = false
): RuleCheckingResult {
    const errors = create_error_collector();

    MAIN:
    for (const [r, c, direction] of rule.render_state.arrows) {
        const pos: Position = [r, c];
        const [dr, dc] = direction_map[direction];

        const v = board_getter(pos);
        if (v === null) {
            const cells: Position[] = [pos];
            let i = 1;
            let new_pos: [number, number] = [r + dr, c + dc];
            while (is_pos(new_pos)) {
                cells.push(new_pos);
                const nv = board_getter(new_pos);
                if (nv === null || (prime ? nv > i : nv === 9)) continue MAIN;
                i++;
                new_pos = [r + dr * i, c + dc * i];
            }
            errors.add_all(cells);
            continue;
        }

        const new_pos: [number, number] = [r + dr * v, c + dc * v];
        if (!is_pos(new_pos)) {
            errors.add(pos);
            continue;
        }
        const nv = board_getter(new_pos);
        if (nv !== null && (prime ? nv <= v : nv !== 9)) {
            errors.add(pos);
            errors.add(new_pos);
        }
    }

    return errors.result();
}

const stream_check: RuleCheckingFunction<StreamRule> = function (
    board_getter: BoardGetter, rule: StreamRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const stream of rule.render_state.streams) {
        let remainder: number | null = null;
        for (const pos of stream) {
            if (remainder !== null) remainder ^= 1;
            const v = board_getter(pos);
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
    board_getter: BoardGetter, rule: PairRule
): RuleCheckingResult {
    const errors = create_error_collector();

    const pairs: Record<number, [Position, Position]> = {};
    for (const [p1, p2] of rule.render_state.dominoes) {
        const v1 = board_getter(p1), v2 = board_getter(p2);
        if (v1 === null || v2 === null) continue;
        const n = Math.min(v1, v2) * 10 + Math.max(v1, v2);
        if (n in pairs) {
            errors.add_all(pairs[n]);
            errors.add(p1);
            errors.add(p2);
        } else {
            pairs[n] = [p1, p2];
        }
    }

    return errors.result();
}

const inversion_check: RuleCheckingFunction<InversionRule> = function (
    board_getter: BoardGetter, rule: InversionRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const line of rule.render_state.lines) {
        let min_num = 0;
        let inversion_count = 0;
        let can_invert = false;

        const nums = line.map(board_getter);
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

const escape_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    const visited = new Set<string>();
    const condition = (pos: Position) => {
        const v = board_getter(pos);
        return v === null || v % 2 === 0;
    }
    const bfs = generate_bfs(visited, condition);

    LOOP:
    for (const pos of generate_positions()) {
        if (visited.has(encode(pos)) || !condition(pos)) continue;

        const region = bfs(pos);
        for (const [nr, _] of region) {
            if (nr === 0 || nr === 8) continue LOOP;
        }

        errors.add_all(region);
    }

    return errors.result();
}

const trail_check: RuleCheckingFunction<TrailRule> = function (
    board_getter: BoardGetter, rule: TrailRule
): RuleCheckingResult {
    if (!is_board_filled(board_getter)) {
        return no_error;
    }

    const errors = create_error_collector();

    const result = trail_sat_solve(board_getter);
    if (!result) {
        errors.add(rule.render_state.start);
        errors.add(rule.render_state.end);
    }

    return errors.result();
}

const triplet_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    for (const p2 of generate_positions([1, 1], [7, 7])) {
        const v2 = board_getter(p2);
        if (v2 === null) continue;

        const [r2, c2] = p2;
        for (const [p1, p3] of [
            [[r2 - 1, c2 - 1], [r2 + 1, c2 + 1]],
            [[r2 - 1, c2 + 1], [r2 + 1, c2 - 1]],
        ] as [Position, Position][]) {
            const v1 = board_getter(p1), v3 = board_getter(p3);
            if (v1 === null || v3 === null) continue;
            if (v1 < v2 && v2 < v3 || v1 > v2 && v2 > v3) {
                errors.add(p1);
                errors.add(p2);
                errors.add(p3);
            }
        }
    }

    return errors.result();
}

const epsilon_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    const visited = new Set<string>();
    const condition = (pos: Position) => {
        const v = board_getter(pos);
        return v === 1 || v === 2 || v === 3 || v === 4;
    }
    const bfs = generate_bfs(visited, condition);

    for (const pos of generate_positions()) {
        const v = board_getter(pos);
        if (v === null || !condition(pos)) continue;
        const region = bfs(pos);
        if (region.length > 3) {
            errors.add_all(region);
            continue;
        }
        if (region.every(pos => get_neighbors(adjacent, pos).every(new_pos => board_getter(new_pos) !== null))) {
            errors.add_all(region);
        }
    }

    return errors.result();
}

const two_product = new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    12, 14, 15, 16, 18, 20, 21, 24, 25, 27,
    28, 30, 32, 35, 36, 40, 42, 45, 48, 49,
    54, 56, 63, 64, 72, 81,
]);

const product_check: RuleCheckingFunction<ProductRule> = function (
    board_getter: BoardGetter, rule: ProductRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, number] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos_extended(direction, index);
        let product = 1;
        let count = 0;
        const positions = ([0, 1, 2] as BoardCoord[]).map(get_pos);
        for (const pos of positions) {
            const v = board_getter(pos);
            if (v === null) continue;
            product *= v;
            count++;
        }

        const q = Math.floor(number / product);
        const r = number % product;

        if (count === 3 && product === number) continue;
        if (count === 2 && r === 0 && 1 <= q && q <= 9) continue;
        if (count === 1 && r === 0 && two_product.has(q)) continue;
        if (count === 0) continue;

        errors.add_all(positions);
        errors.add_direction(direction, index);
    }

    return errors.result();
}

const bumper_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    const bumper: (boolean | null)[][] = Array.from( {length: 9}, _ => Array(9).fill(null) );
    for (const pos of generate_positions()) {
        const v = board_getter(pos);
        let possible = v === null ? new Set<Digit>(digits) : new Set<Digit>([v]);
        let filled_count = 0;
        const neighbors = get_neighbors(adjacent, pos);
        for (const new_pos of neighbors) {
            const nv = board_getter(new_pos);
            if (nv === null) continue;
            filled_count++;
            for (let i = nv - 2; i <= nv + 2; i++) {
                if (is_digit(i)) possible.delete(i);
            }
        }
        const [r, c] = pos;
        if (v !== null && filled_count === neighbors.length) {
            bumper[r][c] = possible.size > 0;
        } else {
            bumper[r][c] = possible.size > 0 ? null : false;
        }
    }

    for (const direction of ["ROW", "COL"] as const) {
        for (const index of board_coords) {
            const get_pos = generate_get_pos(direction, index);
            const bumper_pos: Position[] = [];
            let possible_count = 0;
            for (const i of board_coords) {
                const [r, c] = get_pos(i);
                const b = bumper[r][c];
                if (b === true) bumper_pos.push([r, c]);
                if (b !== false) possible_count += 1;
            }

            if (bumper_pos.length > 1) {
                errors.add_all(bumper_pos);
            }
            if (possible_count < 1) {
                errors.add_all(board_coords.map(get_pos));
            }
        }
    }

    return errors.result();
}

const bridge_check: RuleCheckingFunction<BridgeRule> = function (
    board_getter: BoardGetter, rule: BridgeRule,
): RuleCheckingResult {
    if (!is_board_filled(board_getter)) {
        return no_error;
    }

    const errors = create_error_collector();

    const encode = ([r, c]: Position, n: Digit): number => r * 100 + c * 10 + n;
    const min_row: number[] = Array(9).fill(-1);

    function dfs(stack: Position[], n: Digit, visited: Set<number>): Position[] | null {
        const pos = stack[stack.length - 1];
        if (n !== board_getter(pos)) return null;

        const [r, c] = pos;
        if (r <= min_row[c]) return null;
        if (c === 8) return stack;

        if (visited.has(encode(pos, n))) return null;
        visited.add(encode(pos, n));

        const nc = c + 1;
        for (const nr of [r - 1, r, r + 1]) {
            const np = [nr, nc] as [number, number];
            if (!is_pos(np)) continue;
            stack.push(np);
            const result = dfs(stack, (n % 9 + 1 as Digit), visited);
            if (result !== null) return result;
            stack.pop();
        }
        return null;
    }

    for (const start of rule.render_state.start_rows) {
        const pos: Position = [start, 0];
        const result = dfs([pos], (board_getter(pos) % 9 + 1 as Digit), new Set<number>());
        if (result === null) {
            rule.render_state.start_rows.forEach(r => errors.add([r, 0]));
            return errors.result();
        }
        result.forEach(([r, c]) => { min_row[c] = Math.max(min_row[c], r) });
    }

    return no_error;
}

const reflex_check: RuleCheckingFunction<ReflexRule> = function (
    board_getter: BoardGetter, rule: ReflexRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    const set = new Set<string>(rule.render_state.marked_cells.map(encode));

    NEXT:
    for (const pos of rule.render_state.marked_cells) {
        const v = board_getter(pos);

        let null_count = 0;
        const counts = Array(10).fill(0);
        const neighbors = get_neighbors(king_adjacent, pos)
            .filter(p => set.has(encode(p)));
        for (const new_pos of neighbors) {
            const nv = board_getter(new_pos);
            if (nv === null) {
                null_count++;
            } else {
                counts[nv]++;
            }
        }

        let sum = 0;
        const prefix = counts.map(x => sum += x);
        for (const i of digits) {
            if (v !== null && v !== i) continue;
            if (prefix[i] <= (i - 1) && (i - 1) <= prefix[i] + null_count) continue NEXT;
        }

        errors.add(pos);
    }

    return errors.result();
}

const aquarium_check: RuleCheckingFunction<AquariumRule> = function (
    board_getter: BoardGetter, rule: AquariumRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const region of rule.render_state.regions) {
        const set = new Set<string>(region.map(encode));
        let prev_max = 0, curr_max;
        for (const r of board_coords) {
            curr_max = prev_max;
            for (const c of board_coords) {
                const pos: Position = [r, c];
                if (!set.has(encode(pos))) continue;
                const v = board_getter(pos);
                if (prev_max === 9 || v !== null && v <= prev_max) {
                    errors.add(pos);
                }
                curr_max = Math.max(curr_max, v ?? 0, (prev_max + 1));
            }
            prev_max = curr_max;
        }
    }

    return errors.result();
}

const meta_check: RuleCheckingFunction<MetaRule> = function (
    board_getter: BoardGetter, rule: MetaRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    const positions = generate_record<Digit, Position[]>(digits, () => []);
    let null_count = 0;

    for (const pos of rule.render_state.diamond_cells) {
        const v = board_getter(pos);
        if (v === null) {
            null_count++;
        } else {
            positions[v].push(pos);
        }
    }

    for (const i of digits) {
        const count = positions[i].length;
        if (count === 0) continue;
        if (count + null_count < i || i < count) {
            errors.add_all(positions[i]);
        }
    }

    return errors.result();
}

const link_prime_check: RuleCheckingFunction<LinkPrimeRule> = function (
    board_getter: BoardGetter, rule: LinkPrimeRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    const minmax = (a: number, b: number): [number, number] => a < b ? [a, b]: [b, a];
    const encode = ([r1, c1]: Position, [r2, c2]: Position): number => {
        const [a, b] = minmax(r1, r2);
        const [c, d] = minmax(c1, c2);
        return a * 1000 + b * 100 + c * 10 + d;
    }
    const set = new Set<number>();

    for (const [p1, p2] of rule.render_state.edges) {
        set.add(encode(p1, p2));
    }

    const downright_adjacent = [[0, 1], [1, 0]] as const;
    for (const p1 of generate_positions()) {
        for (const p2 of get_neighbors(downright_adjacent, p1)) {
            const v1 = board_getter(p1), v2 = board_getter(p2);
            if (v1 === null || v2 === null) continue;
            const is_link = Math.abs(v1 - v2) === 1;
            if (is_link !== set.has(encode(p1, p2))) {
                errors.add(p1);
                errors.add(p2);
            }
        }
    }

    return errors.result();
}

const triple_prime_numbers = new Set<number>([
    113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227,
    229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 311, 313, 317, 331, 337, 347, 349,
    353, 359, 367, 373, 379, 383, 389, 397, 419, 421, 431, 433, 439, 443, 449, 457, 461, 463, 467, 479,
    487, 491, 499, 521, 523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 613, 617, 619, 631, 641,
    643, 647, 653, 659, 661, 673, 677, 683, 691, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787,
    797, 811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887, 911, 919, 929, 937, 941,
    947, 953, 967, 971, 977, 983, 991, 997,
]);
const triple_square_numbers = new Set<number>([
    121, 144, 169, 196, 225, 256, 289, 324, 361, 441, 484, 529, 576, 625, 676, 729, 784, 841, 961,
]);

const prism_prime_check: RuleCheckingFunction<PrismPrimeRule> = function (
    board_getter: BoardGetter, rule: PrismPrimeRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r1, c1, r2, c2, r3, c3, type] of rule.render_state.triplets) {
        const set = type ? triple_prime_numbers : triple_square_numbers;
        const p1: Position = [r1, c1], p2: Position = [r2, c2], p3: Position = [r3, c3];
        const v1 = board_getter(p1), v2 = board_getter(p2), v3 = board_getter(p3);
        let exist = false;

        CHECK:
        for (const a of (v1 === null ? digits : [v1])) {
            for (const b of (v2 === null ? digits : [v2])) {
                for (const c of (v3 === null ? digits : [v3])) {
                    if (set.has(a * 100 + b * 10 + c)) {
                        exist = true;
                        break CHECK;
                    }
                }
            }
        }

        if (!exist) {
            errors.add(p1);
            errors.add(p2);
            errors.add(p3);
        }
    }

    return errors.result();
}

const lotus_prime_check: RuleCheckingFunction<LotusPrimeRule> = function (
    board_getter: BoardGetter, rule: LotusPrimeRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const pos of rule.render_state.cells) {
        const v = board_getter(pos);
        const min = v ?? 1, max = (v ?? 9) + 1;

        const neighbors = get_neighbors(adjacent, pos);
        const length = neighbors.length;
        let null_count = 0, sum = 0;
        for (const new_pos of neighbors) {
            const nv = board_getter(new_pos);
            if (nv === null) {
                null_count++;
            } else {
                sum += nv;
            }
        }

        if (sum + null_count * 9 < min * length || max * length <= sum + null_count) {
            errors.add(pos);
        }
    }

    return errors.result();
}

const quad_prime_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    const quad_adjacent = [[0, 0], [0, 1], [1, 0], [1, 1]] as const;

    NEXT:
    for (const pos of generate_positions([0, 0], [7, 7])) {
        const quad = get_neighbors(quad_adjacent, pos);
        let sum = 0;
        for (const new_pos of quad) {
            const nv = board_getter(new_pos);
            if (nv === null) continue NEXT;
            sum += nv;
        }
        if (sum % 3 === 0) {
            errors.add_all(quad);
        }
    }

    return errors.result();
}

const root_prime_check: RuleCheckingFunction<RootPrimeRule> = function (
    board_getter: BoardGetter, rule: RootPrimeRule,
): RuleCheckingResult {
    const root_rule: RootRule = {
        id: "[RT]",
        render_state: rule.render_state,
    };

    return root_check(board_getter, root_rule, true);
}

const sequence_prime_check: RuleCheckingFunction<SequencePrimeRule> = function (
    board_getter: BoardGetter, rule: SequencePrimeRule
): RuleCheckingResult {
    const errors = create_error_collector();

    const sets: Record<"L" | "M" | "H", Set<Digit>> = {
        L: new Set<Digit>([1, 2, 3]),
        M: new Set<Digit>([4, 5, 6]),
        H: new Set<Digit>([7, 8, 9]),
    };

    for (const [direction, index, sequence] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);

        let j = 0;
        for (const i of board_coords) {
            const v = board_getter(get_pos(i))
            if (v === null || sets[sequence[j]].has(v)) j++;
            if (j >= sequence.length) break;
        }

        if (j !== sequence.length) {
            errors.add_direction(direction, index);
        }
    }

    return errors.result();
}

const range_prime_check: RuleCheckingFunction<RangePrimeRule> = function (
    board_getter: BoardGetter, rule: RangePrimeRule
): RuleCheckingResult {
    const errors = create_error_collector();

    const letters = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
    type letters = typeof letters[number];
    const ranges = generate_record<letters, number | null>(letters, () => null);

    NEXT:
    for (const [direction, index, letter] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const one_pos: BoardCoord[] = [], nine_pos: BoardCoord[] = [];
        let null_count = 0;

        for (const i of board_coords) {
            const v = board_getter(get_pos(i));
            if (v === null) null_count++;
            if (v === 1) one_pos.push(i);
            if (v === 9) nine_pos.push(i);
        }

        if (Math.min(one_pos.length, 1) + Math.min(nine_pos.length, 1) + null_count < 2) {
            errors.add_direction(direction, index);
            continue;
        }

        let dist: number | null = null;
        for (const one of one_pos) {
            for (const nine of nine_pos) {
                const d = Math.abs(one - nine);
                if (dist === null) {
                    dist = d;
                } else if (dist !== d) {
                    errors.add_direction(direction, index);
                    errors.add_all(one_pos.map(get_pos));
                    errors.add_all(nine_pos.map(get_pos));
                    continue NEXT;
                }
            }
        }

        if (dist === null) continue;

        if (ranges[letter] === null) {
            ranges[letter] = dist;
        } else if (ranges[letter] !== dist) {
            ranges[letter] = -1;
        }
    }

    const values = new Set<number>([-1]);
    const duplicates = new Set<number>();
    for (const letter of letters) {
        const value = ranges[letter];
        if (value === null) continue;
        if (values.has(value)) {
            duplicates.add(value);
        } else {
            values.add(value);
        }
    }

    for (const [direction, index, letter] of rule.render_state.side_hints) {
        if (ranges[letter] === null) continue;
        if (duplicates.has(ranges[letter])) {
            errors.add_direction(direction, index);
        }
    }

    return errors.result();
}

const trail_prime_check: RuleCheckingFunction<TrailPrimeRule> = function (
    board_getter: BoardGetter, rule: TrailPrimeRule
): RuleCheckingResult {
    const trail_rule: TrailRule = {
        id: "[TR]",
        render_state: rule.render_state,
    };

    return trail_check(board_getter, trail_rule);
}

const row_prime_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    const missing = generate_record<Digit, BoardCoord[]>(digits, () => []);

    for (const r of board_coords) {
        const record = generate_record<Digit, BoardCoord[]>(digits, () => []);
        const set = new Set<Digit>();
        const duplicates = new Set<Digit>();
        const triples = new Set<Digit>();

        for (const c of board_coords) {
            const v = board_getter([r, c]);
            if (v === null) continue;
            record[v].push(c);
            set.add(v);
            if (record[v].length == 2) {
                duplicates.add(v);
            }
            if (record[v].length == 3) {
                triples.add(v);
            }
        }

        if (triples.size >= 1) {
            for (const triple of triples) {
                errors.add_all(record[triple].map(c => [r, c]));
            }
        } else if (duplicates.size >= 2) {
            for (const duplicate of duplicates) {
                errors.add_all(record[duplicate].map(c => [r, c]));
            }
        } else if (set.size === 9) {
            errors.add_all(board_coords.map(c => [r, c]));
        } else if (set.size === 8) {
            for (const d of digits) {
                if (!set.has(d)) missing[d].push(r);
            }
        }
    }

    for (const d of digits) {
        if (missing[d].length >= 2) {
            for (const r of missing[d]) {
                errors.add_all(board_coords.map(c => [r, c]));
            }
        }
    }

    return errors.result();
}

const block_check: PureCheckingFunction = function (board_getter: BoardGetter): RuleCheckingResult {
    const errors = create_error_collector();

    const visited = new Set<string>();
    const condition_low = (pos: Position) => {
        const v = board_getter(pos);
        return v === 1 || v === 2 || v === 3;
    };
    const condition_high = (pos: Position) => {
        const v = board_getter(pos);
        return v === 7 || v === 8 || v === 9;
    };

    const bfs_low = generate_bfs(visited, condition_low);
    const bfs_high = generate_bfs(visited, condition_high);

    for (const pos of generate_positions()) {
        if (visited.has(encode(pos))) continue;

        let region: Position[] | null = null;
        if (condition_low(pos)) region = bfs_low(pos);
        if (condition_high(pos)) region = bfs_high(pos);
        if (region === null) continue;

        const min_row = Math.min(...region.map(([r, _]) => r)) as BoardCoord;
        const max_row = Math.max(...region.map(([r, _]) => r)) as BoardCoord;
        const min_col = Math.min(...region.map(([_, c]) => c)) as BoardCoord;
        const max_col = Math.max(...region.map(([_, c]) => c)) as BoardCoord;

        if (region.length !== (max_row - min_row + 1) * (max_col - min_col + 1)) continue;
        if (region.some(pos => get_neighbors(adjacent, pos).some(new_pos => board_getter(new_pos) === null))) continue;
        errors.add_all(region);
    }

    return errors.result();
}

const box_prime_check: RuleCheckingFunction<BoxPrimeRule> = function (
    board_getter: BoardGetter, rule: BoxPrimeRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [i, [a, b]] of rule.render_state.hints.entries()) {
        const r = i - i % 3, c = i % 3 * 3;
        const p1 = [r, c] as Position, p2 = [r + 2, c + 2] as Position;

        const color = {'min': 0, 'max': 0}, uncolor = {'min': 0, 'max': 0};
        for (const [nr, nc] of generate_positions(p1, p2)) {
            const nv = board_getter([nr, nc]);
            const target = ((nr + nc) % 2 === 0 ? color : uncolor);
            target.min += nv ?? 1;
            target.max += nv ?? 9;
        }

        const color_a = color.min <= a && a <= color.max;
        const color_b = color.min <= b && b <= color.max;
        const uncolor_a = uncolor.min <= a && a <= uncolor.max;
        const uncolor_b = uncolor.min <= b && b <= uncolor.max;
        const data = [color_a, uncolor_a, color_b, uncolor_b];

        if (color_a && uncolor_b || color_b && uncolor_a) continue;

        let possible: number;
        if (data.every(x => x === false)) {
            possible = -1;
        } else if (data.filter(x => x === false).length === 3) {
            possible = data.findIndex(x => x === true) % 2;
        } else if (color_a && color_b) {
            possible = 0;
        } else if (uncolor_a && uncolor_b) {
            possible = 1;
        } else {
            possible = -1;
        }

        for (const [nr, nc] of generate_positions(p1, p2)) {
            if ((nr + nc) % 2 !== possible) errors.add([nr, nc]);
        }
    }

    return errors.result();
}

const vector_prime_check: RuleCheckingFunction<VectorPrimeRule> = function (
    board_getter: BoardGetter, rule: VectorPrimeRule
): RuleCheckingResult {
    const vector_rule: VectorRule = {
        id: "[VT]",
        render_state: rule.render_state,
    };

    return vector_check(board_getter, vector_rule, true);
}

const rule_checks: Record<RuleID, (board_getter: BoardGetter, rule: Rule) => RuleCheckingResult> = {
    "[Sudoku]": sudoku_check,
    "[R]": row_check,
    "[R']": row_prime_check,
    "[C]": column_check,
    "[B]": box_check,
    "[DT]": distant_check,
    "[QD]": quad_check,
    "[ES]": escape_check,
    "[TP]": triplet_check,
    "[EP]": epsilon_check,
    "[BP]": bumper_check,
    "[QD']": quad_prime_check,
    "[BL]": block_check,
    "[SG]": (state, rule) => segment_check(state, rule as SegmentRule),
    "[LK]": (state, rule) => link_check(state, rule as LinkRule),
    "[LO]": (state, rule) => lotus_check(state, rule as LotusRule),
    "[MR]": (state, rule) => metro_check(state, rule as MetroRule),
    "[RF]": (state, rule) => reference_check(state, rule as ReferenceRule),
    "[PR]": (state, rule) => prism_check(state, rule as PrismRule),
    "[QT]": (state, rule) => quantum_check(state, rule as QuantumRule),
    "[RG]": (state, rule) => range_check(state, rule as RangeRule),
    "[SQ]": (state, rule) => sequence_check(state, rule as SequenceRule),
    "[TM]": (state, rule) => temperature_check(state, rule as TemperatureRule),
    "[RT]": (state, rule) => root_check(state, rule as RootRule),
    "[PO]": (state, rule) => point_check(state, rule as PointRule),
    "[ST]": (state, rule) => stencil_check(state, rule as StencilRule),
    "[VT]": (state, rule) => vector_check(state, rule as VectorRule),
    "[SR]": (state, rule) => stream_check(state, rule as StreamRule),
    "[PA]": (state, rule) => pair_check(state, rule as PairRule),
    "[IV]": (state, rule) => inversion_check(state, rule as InversionRule),
    "[TR]": (state, rule) => trail_check(state, rule as TrailRule),
    "[PD]": (state, rule) => product_check(state, rule as ProductRule),
    "[BD]": (state, rule) => bridge_check(state, rule as BridgeRule),
    "[EF]": (state, rule) => reflex_check(state, rule as ReflexRule),
    "[AQ]": (state, rule) => aquarium_check(state, rule as AquariumRule),
    "[MT]": (state, rule) => meta_check(state, rule as MetaRule),
    "[B']": (state, rule) => box_prime_check(state, rule as BoxPrimeRule),
    "[LK']": (state, rule) => link_prime_check(state, rule as LinkPrimeRule),
    "[PR']": (state, rule) => prism_prime_check(state, rule as PrismPrimeRule),
    "[LO']": (state, rule) => lotus_prime_check(state, rule as LotusPrimeRule),
    "[RT']": (state, rule) => root_prime_check(state, rule as RootPrimeRule),
    "[SQ']": (state, rule) => sequence_prime_check(state, rule as SequencePrimeRule),
    "[RG']": (state, rule) => range_prime_check(state, rule as RangePrimeRule),
    "[TR']": (state, rule) => trail_prime_check(state, rule as TrailPrimeRule),
    "[SG']": (state, rule) => segment_prime_check(state, rule as SegmentPrimeRule),
    "[VT']": (state, rule) => vector_prime_check(state, rule as VectorPrimeRule),
} as const;

export function check_all(
    solving_state: SolvingState, rules: Rule[]
): [boolean, Partial<Record<RuleID, PositionExtended[]>>] {
    let correct = true;
    const errors: Partial<Record<RuleID, PositionExtended[]>> = {};

    const board_getter = generate_board_getter(solving_state);
    for (const rule of rules) {
        const id = rule.id;
        const check = rule_checks[id];
        if (!check) continue;
        const [c, e] = check(board_getter, rule);
        if (!c) correct = false;
        errors[id] = e;
    }

    return [correct, errors];
}

function memo_duplicate_check(
    board_getter: BoardGetter, map: CoordinateMappingFunction, error_board: Set<Digit>[][], [a, b]: [number, number] = [9, 9]
) {
    for (let i = 0; i < a; i++) {
        const positions = Array.from({length: b}, (_, x) => map(i, x));
        const set = new Set<Digit>(
            positions.map(board_getter).filter(x => x !== null)
        );
        for (const [r, c] of positions) {
            set.forEach(digit => error_board[r][c].add(digit));
        }
    }
}

function memo_pair_check(
    board_getter: BoardGetter, adjacent: readonly (readonly [number, number])[], error_board: Set<Digit>[][]
) {
    for (const pos of generate_positions()) {
        const v = board_getter(pos);
        if (v === null) continue;

        for (const [nr, nc] of get_neighbors(adjacent, pos)) {
            error_board[nr][nc].add(v);
        }
    }
}

export function check_memo(
    solving_state: SolvingState, rules: Rule[]
): Set<Digit>[][] {
    const error_board = Array.from({ length: 9 }, _ => Array.from({ length: 9 }, _ => new Set<Digit>()));
    const board_getter = generate_board_getter(solving_state);

    for (const rule of rules) {
        if (rule.id === "[R]") {
            memo_duplicate_check(board_getter, (row, index) => [row, index] as Position, error_board);
        }
        if (rule.id === "[C]") {
            memo_duplicate_check(board_getter, (col, index) => [index, col] as Position, error_board);
        }
        if (rule.id === "[B]") {
            memo_duplicate_check(board_getter, (box, index) =>
                [(Math.floor(box / 3) * 3 + Math.floor(index / 3)), (box % 3) * 3 + (index % 3)] as Position, error_board);
        }
        if (rule.id === "[SG]") {
            memo_duplicate_check(board_getter, (region, index) => rule.render_state.regions[region][index], error_board);
        }
        if (rule.id === "[SG']") {
            memo_duplicate_check(board_getter, (region, index) => rule.render_state.regions[region][index], error_board, [16, 5]);
        }
        if (rule.id === "[DT]") {
            memo_pair_check(board_getter, king_adjacent, error_board);
        }
    }

    return error_board;
}
