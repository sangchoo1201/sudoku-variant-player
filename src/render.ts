import type {PuzzleData} from "./schema.ts";

const grid = document.getElementById('main-grid')!;
const corner_order = [0, 4, 1, 6, 8, 7, 2, 5, 3] as const;

export type CellType = {
    cell: HTMLDivElement,
    normal: HTMLDivElement,
    corner: HTMLDivElement[],
    center: HTMLDivElement,
}

export function setup_grid(puzzle_data: PuzzleData) {
    const cell_map: CellType[][] = [];
    for (let r = 0; r < 9; r++) {
        cell_map[r] = [];
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            grid.appendChild(cell);

            const normal = document.createElement('div');
            normal.classList.add('normal');
            cell.appendChild(normal);

            const corner = document.createElement('div');
            corner.classList.add('corner');
            cell.appendChild(corner);

            const corner_cells: HTMLDivElement[] = [];
            for (let i = 0; i < 9; i++) {
                const corner_inner = document.createElement('div');
                corner_cells[corner_order[i]] = corner_inner;
                corner.appendChild(corner_inner);
            }

            const center = document.createElement('div');
            center.classList.add('center');
            cell.appendChild(center);

            cell.dataset.row = r.toString();
            cell.dataset.col = c.toString();

            if (r % 3 === 0) cell.classList.add('thick-top');
            if (c % 3 === 0) cell.classList.add('thick-left');
            if (r === 8) cell.classList.add('thick-bottom');
            if (c === 8) cell.classList.add('thick-right');

            const value = puzzle_data.board[r][c];
            if (value === 0) {
                normal.textContent = '';
            } else {
                normal.textContent = value.toString();
                cell.classList.add('fixed');
            }

            cell_map[r][c] = {
                cell: cell,
                normal: normal,
                corner: corner_cells,
                center: center,
            };
        }
    }
    return cell_map;
}
