# Chat order flows

Each business-specific flow lives in its own sibling folder under `flows/` and exports a `ChatOrderFlow` implementation. The shared contract is in `chat-ordering/core/types.ts`; flow selection is in `chat-ordering/registry.ts`.

To add a flow:

1. Create `flows/<flow-key>/` and implement the shared contract from `chat-ordering/core/types.ts`.
2. Keep company-specific questions, validation, payment policy, and reply instructions inside that folder.
3. Register the module in `chat-ordering/registry.ts` and map the normalized company code to its flow key in `COMPANY_FLOW_ASSIGNMENTS`.
4. Reuse shared Messenger order, payment, and notification services where their behavior matches the new flow.

The registry falls back to `bakery-default`, preserving existing behavior for companies without an explicit assignment. Keep tenant ownership checks and company/page/conversation scoping in every flow.
