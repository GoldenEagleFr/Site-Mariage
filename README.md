# Site-Mariage
Site du mariage d'Antoine et Florence

## Lancer le site en local

1. Lancer le serveur :

```powershell
python server.py
```

Ne pas utiliser `python -m http.server` pour l'espace admin: l'API `/api/admin/check` n'existe pas sur ce serveur statique.

2. Ouvrir dans le navigateur :

```text
http://127.0.0.1:8000
```

3. Pour l'espace admin (`organisation.html`):
- Mot de passe par défaut : `mariage2026`
- Pour définir ton propre mot de passe :

```powershell
$env:MARIAGE_ADMIN_PASSWORD="ton_mot_de_passe"
python server.py
```

## Export Excel du budget

- Le serveur met à jour automatiquement `budget_mariage.xlsx` dans le dossier du projet.
- Le fichier Excel est régénéré au démarrage du serveur puis à chaque modification enregistrée dans l'admin (budget, tâches, invités/RSVP).
- Le classeur contient 2 onglets: `Budget Mariage` et `Invités RSVP`.
- Installer la dépendance une fois sur la machine :

```powershell
python -m pip install openpyxl
```

