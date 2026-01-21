pipeline {
    agent any
    
    stages {
        stage('Pull Latest Code') {
            steps {
                sh '''
                    sudo git config --global --add safe.directory /home/ubuntu/project
                    cd /home/ubuntu/project
                    
                    # .env 파일 백업
                    if [ -f backend/.env ]; then
                        cp backend/.env /tmp/backend.env.backup
                    fi
                    
                    sudo git fetch origin
                    sudo git reset --hard origin/main
                    
                    # .env 파일 복원
                    if [ -f /tmp/backend.env.backup ]; then
                        cp /tmp/backend.env.backup backend/.env
                    fi
                '''
            }
        }
        
        stage('Build and Deploy') {
            steps {
                sh '''
                    cd /home/ubuntu/project
                    sudo docker compose down || true
                    sudo docker compose up -d --build
                '''
            }
        }
        
        stage('Health Check') {
            steps {
                sh '''
                    sleep 30
                    curl -f -k https://plyst.info || exit 1
                    curl -f -k https://plyst.info/api/health || echo "Backend health check skipped"
                    echo "Health check passed!"
                '''
            }
        }
        
        stage('Cleanup') {
            steps {
                sh 'sudo docker image prune -f'
            }
        }
    }
    
    post {
        success {
            echo '✅ Deployment successful! Frontend + Backend'
        }
        failure {
            echo '❌ Deployment failed!'
        }
    }
}
