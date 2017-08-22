import * as Rx from 'rxjs/Rx';
import * as _ from 'lodash';
import * as jd from 'jdenticon';
import rxd = require('rx-dom');

// FIXME: import only dependencies that we really need.
// import { Observable } from 'rxjs/Observable';
// import 'rxjs/add/observable/of';
// import 'rxjs/add/observable/range';
// import 'rxjs/add/observable/range';

const DEFAULT_NUMBER_OF_SOLDIERS = 41;
const DEFAULT_NUMBER_OF_STEPS = 3;

export class Main {

    private numSoldier$: Rx.Observable<number>;

    private numStep$: Rx.Observable<number>;

    private renderer: Renderer;

    constructor() {
        const valueStreamForInput = (element: HTMLElement, defaultValue: number) => {
            return Rx.Observable.fromEvent(element, 'change')
                .map((event: any) => event.target.value)
                .startWith(defaultValue);
        };

        const soldiersElement: HTMLInputElement = document.getElementById('numSoldiers') as HTMLInputElement;
        this.numSoldier$ = valueStreamForInput(soldiersElement, DEFAULT_NUMBER_OF_SOLDIERS);

        const stepsElement: HTMLInputElement = document.getElementById('numSteps') as HTMLInputElement;
        this.numStep$ = valueStreamForInput(stepsElement, DEFAULT_NUMBER_OF_STEPS);

        const rootElement = document.getElementById('center');
        this.renderer = new Renderer(rootElement, this.numSoldier$, this.numStep$);
    }

}


class Renderer {

    constructor(private contentRootElement: HTMLElement,
                private numberOfSoldier$: Rx.Observable<number>,
                private numberOfStep$: Rx.Observable<number>,
                circleRadius = 300) {
        Rx.Observable.combineLatest(numberOfSoldier$, numberOfStep$).subscribe(([numSoldiers, numSteps]) => {
            this.clearContent();
            this.renderSoldierCircle(numSoldiers, circleRadius);
            this.startExecutionAnimation(numSoldiers, numSteps, circleRadius);
        });
    }

    private tick$ = Rx.Observable.interval(300, Rx.Scheduler.animationFrame);

    private animation: Rx.Subscription;

    private calculateSoldierPosition(numberOfSoldiers: number, circleRadius: number, index: number): [number, number] {
        const CIRCLE_RADIUS = 360;
        const CIRCLE_HALF = 180;
        const circleSegmentSize = CIRCLE_RADIUS / numberOfSoldiers;
        const offsetToRootCenter = this.contentRootElement.offsetWidth / 2;
        const offsetToChildCenter = 20; // FIXME: should be a parameter
        const totalOffset = offsetToRootCenter - offsetToChildCenter;

        const x = Math.cos((circleSegmentSize * index) * (Math.PI / CIRCLE_HALF)) * circleRadius;
        const left = x + totalOffset;
        const y = Math.sin((circleSegmentSize * index) * (Math.PI / CIRCLE_HALF)) * circleRadius;
        const top = y + totalOffset;

        return [left, top];
    }

    private renderSoldier(soldierName: string, left: number, top: number, width: number = 40, height: number = 40): SVGSVGElement {
        const soldierElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

        soldierElement.id = soldierName;
        soldierElement.setAttribute('data-jdenticon-value', soldierName);
        soldierElement.style.position = 'absolute';
        soldierElement.setAttribute('width', `${width}px`);
        soldierElement.setAttribute('height', `${height}px`);
        soldierElement.style.top = `${top}px`;
        soldierElement.style.left = `${left}px`;

        return soldierElement;
    }

    renderSoldierCircle(numSoldiers: number, circleRadius: number) {
        const soldierId$ = Rx.Observable.of(... _.range(0, numSoldiers));
        const soldierPosition$ = soldierId$.map(i => this.calculateSoldierPosition(numSoldiers, circleRadius, i));
        Rx.Observable.zip(soldierId$, soldierPosition$).subscribe(([i, [left, top]]) => {
            const soldierElement = this.renderSoldier(`soldier${i}`, left, top);
            this.contentRootElement.appendChild(soldierElement);
            window['jdenticon'].update(`#soldier${i}`); // FIXME: Bad! Fix build and bundling for this dependency as well!
        });
    }

    startExecutionAnimation(numberOfSoldiers: number, numberOfSteps: number, circleRadius: number) {
        const step$ = josephusExecution$(numberOfSoldiers, numberOfSteps);
        this.animation = Rx.Observable.zip(this.tick$, step$)
            .subscribe(([tick, [id, status]]) => {
                const [left, top] = this.calculateSoldierPosition(numberOfSoldiers, circleRadius, id);
                const outlineElement = this.renderOutline(left, top);

                this.contentRootElement.appendChild(outlineElement);

                if (status === SoldierStatus.DEAD) {
                    const deadSoldierElement = document.getElementById(`soldier${id}`);
                    deadSoldierElement.remove();
                }
            });
    }

    renderOutline(left: number, top: number, width: number = 40, height: number = 40): HTMLElement {
        const OUTLINE_ID = 'soldierOutline';

        const previousOutlineElement = document.getElementById(OUTLINE_ID);
        if (previousOutlineElement) {
            previousOutlineElement.remove();
        }

        const outlineElement = document.createElement('div');
        outlineElement.id = OUTLINE_ID;
        outlineElement.className = 'outline';
        outlineElement.style.top = `${top}px`;
        outlineElement.style.left = `${left}px`;
        outlineElement.style.height = `${height}`;
        outlineElement.style.width = `${width}`;

        return outlineElement;
    }

    clearContent() {
        if (this.animation) {
            this.animation.unsubscribe();
        }
        this.contentRootElement.innerHTML = "";
    }
}

export type SoldierId = number;

enum SoldierStatus {
    ALIVE = 0,
    DEAD = 1
}

function josephusExecution$(numberOfSoldiers: number, stepSize: number): Rx.Observable<[SoldierId, SoldierStatus]> {
    let timeoutId: number;

    return Rx.Observable.create((observer: Rx.Observer<[SoldierId, SoldierStatus]>) => {
        const josephusWorker = (state: State): void => {
            if (_.isEmpty(state.alive)) {
                observer.complete();
                return;
            }

            const newState = _.reduce(state.alive, (state, soldierId) => {
                if (state.counter === stepSize - 1) {
                    observer.next([soldierId, SoldierStatus.DEAD]);
                    const indexOfExecuted = state.alive.indexOf(soldierId);
                    return new State(
                        [...state.alive.slice(0, indexOfExecuted),
                            ...state.alive.slice(indexOfExecuted + 1)],
                        0
                    );
                }
                observer.next([soldierId, SoldierStatus.ALIVE]);
                return new State(state.alive, state.counter + 1);
            }, state);

            timeoutId = setTimeout(josephusWorker(newState), 0);
        };

        class State {
            constructor(public alive: Array<SoldierId>, public counter: number) {
            }
        }

        timeoutId = setTimeout(josephusWorker(new State(_.range(0, numberOfSoldiers), 0)), 0);

        return () => {
            clearTimeout(timeoutId);
        }
    });
}


new Main();
