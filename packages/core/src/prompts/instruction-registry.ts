export class InstructionRegistry {
  private readonly instructions = new Set<string>();

  registerInstruction(instruction: string): void {
    this.instructions.add(instruction);
  }
}
