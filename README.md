# Library Management System

A beginner-friendly library management web application for a DevOps lab project.

## Features

- Admin login
- Dashboard statistics
- Add, edit, delete, search and filter books
- Track total and available copies
- Register and search students
- Issue books with a 14-day due date
- Return books and automatically restore availability
- Issue/return history
- Docker image build
- Jenkins pipeline for dependency installation, syntax checks and Docker image build

## Requirements

- Node.js 20 or later
- npm
- Docker Desktop (for Docker)
- Jenkins with Git and Docker available on the Jenkins agent (for the pipeline)

## Run locally in VS Code (Windows PowerShell)

1. Extract the ZIP.
2. Open the extracted `library-management-system-updated` folder in VS Code.
3. In the VS Code terminal, confirm the folder contains `package.json`:
   ```powershell
   dir
   ```
4. Copy the example environment file:
   ```powershell
   Copy-Item .env.example .env
   ```
5. Open `.env` and set a long random `SESSION_SECRET` and a private `ADMIN_PASSWORD`.
6. Install dependencies:
   ```powershell
   npm install
   ```
7. Start the app:
   ```powershell
   npm start
   ```
8. Open http://localhost:3000.
9. Sign in using the username/password from `.env`.

If you do not edit `.env`, the demo login is `admin` / `ChangeMe123!`. Change it before sharing or deploying the application.

## Data storage

The first run creates `data/db.json` with sample books and one demo student. The file stores books, students and transaction history. Back it up regularly. This simple JSON storage is intended for a classroom/demo project, not a multi-user production deployment.

## Run with Docker

Build the image:
```powershell
docker build -t library-management-system:latest .
```

Run it with persistent data:
```powershell
docker volume create library-data
docker run -d --name library-management-system -p 3000:3000 --env ADMIN_USERNAME=admin --env ADMIN_PASSWORD=ChangeThisPassword123! --env SESSION_SECRET=ReplaceWithALongRandomSecret --mount source=library-data,target=/app/data library-management-system:latest
```

Open http://localhost:3000.

Useful commands:
```powershell
docker ps
docker logs library-management-system
docker stop library-management-system
docker start library-management-system
```

To remove the container:
```powershell
docker rm -f library-management-system
```

Do not delete the `library-data` volume if you want to keep its data.

## Jenkins setup (Windows Jenkins)

1. Push the project to a GitHub repository.
2. Make sure Node.js, Git, Docker Desktop and the Docker CLI are installed and available to the Jenkins service account.
3. In Jenkins, create a **Pipeline** job.
4. In Pipeline configuration, select **Pipeline script from SCM**.
5. Select **Git**, enter your repository URL, and set Script Path to `Jenkinsfile`.
6. Save and click **Build Now**.
7. The pipeline checks out code, installs npm packages, runs syntax checks, and builds a Docker image tagged with the build number and `latest`.

The Jenkinsfile uses Windows `bat` steps. For a Linux Jenkins agent, change `bat` to `sh` and adjust the pipeline commands.

## Troubleshooting

- `ENOENT package.json`: Open the project root folder, not `public` or `data`. Run `dir` and confirm `package.json` is listed.
- `npm` is not recognized: Install Node.js LTS, restart VS Code, then check `node --version` and `npm --version`.
- Docker is not recognized: Start Docker Desktop and check `docker --version`.
- Port 3000 is busy: Set a different `PORT` in `.env` and open that port.
- Login fails: Use the credentials configured in `.env`; restart the app after changing `.env`.
- Jenkins says `Jenkinsfile` not found: Confirm `Jenkinsfile` is in the repository root and Script Path is exactly `Jenkinsfile`.

## Security note

This is an educational starter. The default Express session store is in-memory and is not intended for production. For public deployment, use a production session store, HTTPS, a strong session secret, secure secret management, backups, and a real database with appropriate access controls.
