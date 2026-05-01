import { type PuzzleData, PuzzleDataSchema } from "./schema.ts"

export const default_data: PuzzleData = {
    id: "#00000",
    difficulty: 0,
    board: Array.from({ length: 9 }, () => Array(9).fill(0)),
    rules: [
        {
            id: "[Sudoku]",
            params: {},
        },
        {
            id: "[R]",
            params: {}
        },
        {
            id: "[C]",
            params: {}
        },
        {
            id: "[B]",
            params: {}
        },
    ]
};

function base64_decode_or_null(base64: string): string | null {
    const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    if (base64Regex.test(base64)) { return atob(base64); }
    return null;
}

function json_decode_or_null(json: string): any {
    try {
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

function parse_data(code: string | null): object {
    if (code == null) { return {}; }
    const base64_data = decodeURIComponent(code);
    const json_data = base64_decode_or_null(base64_data);
    if (json_data == null) { return {}; }
    const data = json_decode_or_null(json_data);
    if (data == null || !(data instanceof Object)) { return {}; }
    return data;
}

const query_string = window.location.search;
const url_params = new URLSearchParams(query_string);
const code = url_params.get('code');
const parsed_data = parse_data(code);
const result = PuzzleDataSchema.safeParse(parsed_data);
const puzzle_data: PuzzleData = result.success ? result.data : default_data;

console.log(puzzle_data);
console.log(result.success);
