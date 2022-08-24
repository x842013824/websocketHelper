import { Observable, Observer, Subject, Subscription } from 'rxjs';

export interface WebSocketOptions {
    /** whether to reconnect when disconnected */
    autoReconnect?: boolean,
    /** max reconnect times */
    reconnectLimits?: number
}

export class WebSocketHelper {
    public status: boolean = false;

    private ws: WebSocket | null = null;

    private publisher: Subject<unknown> | null = null;

    private listeners: Subscription[] = [];

    private url: string = '';

    private options: WebSocketOptions = {
        autoReconnect: true,
        reconnectLimits: 5
    };

    //* when message receive before subscribe, cache it 
    private cacheMessages: string[] = [];

    /**
     * @description connect websocket
     * @param url websocket url
     * @returns an Promise always be resolved
     */
    public connect(url: string, options?: WebSocketOptions) {
        this.url = url;
        this.options = options || this.options;

        return new Promise<boolean>((resolve) => {
            this.ws = new WebSocket(url);
            this.ws.onopen = () => {
                this.status = true;
                this.initPublish();
                resolve(true);
            };
            this.ws.onerror = () => resolve(false);
        });
    }

    /**
     * @description reconnect websocket
     * @param limits max reconnect times
     */
    private async reconnect(limits: number = 5) {
        // can't call reconnect before call connect
        if (!this.url)
            return;

        let reconnectTime = 0;
        while (!await this.connect(this.url) && reconnectTime < limits) {
            reconnectTime++;
        }
    }


    /**
     * @description: send message to server
     * @param {unknown} message
     */
    public send(message: unknown): void {
        if (this.ws?.readyState === WebSocket.OPEN) {
            let sendMessage: string;
            try {
                sendMessage = typeof message === 'string' ? message : JSON.stringify(message);
                this.ws.send(sendMessage);
            } catch {
                throw new Error(`invalid message ${message}`);
            }
        }
    }

    /**
     * @description: close websocket connection
     */
    public close() {
        this.ws?.close();
    }


    /**
     * @description: subscribe websocket message
     * @param {Partial} callback
     */
    public subscribe(callback: Partial<Observer<unknown>> | ((value: unknown) => void)) {
        const listen = this.publisher!.subscribe(callback);
        this.clearCacheMessages();
        this.listeners.push(listen);
    }


    private clearCacheMessages() {
        if (!this.cacheMessages.length)
            return;

        let cacheMessage;
        while (cacheMessage = this.cacheMessages.pop()) {
            console.log(`handle cache message: ${cacheMessage}`);
            this.publisher!.next(JSON.parse(cacheMessage) as T);
        }
    }


    private initPublish() {
        this.publisher = new Subject();

        const observable = new Observable((observer: Observer<MessageEvent<unknown>>) => {
            this.ws!.onmessage = observer.next.bind(observer);
            this.ws!.onclose = observer.complete.bind(observer);
            this.ws!.onerror = observer.complete.bind(observer);
        });

        observable.subscribe({
            next: ({ data }) => {
                let message;
                try {
                    message = typeof data === 'string' ? JSON.parse(data) : data;
                } catch (error) {
                    message = data;
                }

                if (!this.listeners.length) {
                    console.log(`cache message: ${data}`);
                    this.cacheMessages.push(data as string);
                } else {
                    console.log(`handle message: ${data}`);
                    this.publisher!.next(message);
                }

            },
            error: () => {
                // connection error, reconnect
                const { autoReconnect, reconnectLimits } = this.options;
                autoReconnect && this.reconnect(reconnectLimits);
            },
            complete: () => {
                this.status = false;
                this.publisher!.complete();
                this.listeners.forEach(item => item.unsubscribe());
                this.listeners = [];
            }
        });
    }
}