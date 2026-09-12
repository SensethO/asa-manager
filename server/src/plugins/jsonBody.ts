import type { FastifyInstance } from 'fastify';

/**
 * Accepte un corps JSON vide.
 *
 * Par defaut Fastify refuse en 400 toute requete annoncant `application/json`
 * avec un corps vide (FST_ERR_CTP_EMPTY_JSON_BODY). Or beaucoup d'actions de
 * cette API n'ont pas de corps : demarrer un serveur, lancer une installation,
 * supprimer une sauvegarde. Un client qui pose l'en-tete par reflexe verrait
 * ces appels echouer sans raison comprehensible.
 *
 * Un corps vide est donc traite comme un objet vide, ce que les routes savent
 * deja gerer via leurs valeurs par defaut. Un corps present mais invalide
 * continue d'etre rejete.
 */
export function registerJsonBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body.trim() : '';

    if (text === '') {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(text));
    } catch (error) {
      const failure = error as Error & { statusCode?: number };
      failure.statusCode = 400;
      done(failure, undefined);
    }
  });
}
