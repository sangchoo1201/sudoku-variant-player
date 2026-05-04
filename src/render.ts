import type {PuzzleData} from "./schema.ts";

const grid = document.getElementById('main-grid')!;
const cellMap: HTMLDivElement[][] = [];

export function setup_grid(puzzle_data: PuzzleData) {
    for (let r = 0; r < 9; r++) {
        cellMap[r] = [];
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');

            cell.dataset.row = r.toString();
            cell.dataset.col = c.toString();

            if (r % 3 === 0) cell.classList.add('thick-top');
            if (c % 3 === 0) cell.classList.add('thick-left');
            if (r === 8) cell.classList.add('thick-bottom');
            if (c === 8) cell.classList.add('thick-right');

            const value = puzzle_data.board[r][c];
            if (value === 0) {
                cell.textContent = '';
            } else {
                cell.textContent = value.toString();
            }

            grid.appendChild(cell);
            cellMap[r][c] = cell;
        }
    }
}
