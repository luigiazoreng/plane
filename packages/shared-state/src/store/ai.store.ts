import { observable, action, makeObservable } from "mobx";

export class AIStore {
    chatOpen: boolean = false;
    messages: { role: string; content: string }[] = [];
    isProcessing: boolean = false;
    plannedAction: any = null; // For Build Mode

    constructor() {
        makeObservable(this, {
            chatOpen: observable,
            messages: observable,
            isProcessing: observable,
            plannedAction: observable,
            toggleChat: action,
            addMessage: action,
            setProcessing: action,
            setPlannedAction: action
        });
    }

    toggleChat() {
        this.chatOpen = !this.chatOpen;
    }

    addMessage(role: string, content: string) {
        this.messages.push({ role, content });
    }

    setProcessing(status: boolean) {
        this.isProcessing = status;
    }

    setPlannedAction(plannedActionParam: any) {
        this.plannedAction = plannedActionParam;
    }
}
