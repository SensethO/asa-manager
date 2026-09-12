/**
 * Files d'execution, une par cle, garantissant qu'aucune tache portant la meme
 * cle ne s'execute en parallele.
 *
 * Motivation : le RCON d'ARK ne tolere pas deux connexions concurrentes. La
 * seconde reste sans reponse a l'authentification, ce qui se manifeste par des
 * commandes qui echouent au hasard selon qu'une sonde de fond tourne ou non.
 */
export class SerialQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Met la tache en file derriere celles deja enregistrees pour cette cle.
   * L'echec d'une tache ne bloque pas les suivantes.
   */
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();

    // Le maillon precedent est neutralise dans les deux sens pour que la chaine
    // se poursuive apres une erreur
    const next = previous.then(task, task);

    this.tails.set(
      key,
      next.catch(() => undefined),
    );

    return next;
  }

  /** Nombre de cles ayant encore une chaine enregistree, pour les tests */
  get size(): number {
    return this.tails.size;
  }
}
