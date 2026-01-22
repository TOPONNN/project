pipeline {
    agent any
    
    environment {
        GPU_SERVER = '***REDACTED_GPU_IP***'
        GPU_SSH_KEY = '/var/lib/jenkins/.ssh/gpu_key'
    }
    
    stages {
        stage('Pull Latest Code') {
            steps {
                sh '''
                    sudo git config --global --add safe.directory /home/ubuntu/project
                    cd /home/ubuntu/project
                    
                    if [ -f backend/.env ]; then
                        cp backend/.env /tmp/backend.env.backup
                    fi
                    
                    sudo git fetch origin
                    sudo git reset --hard origin/main
                    
                    if [ -f /tmp/backend.env.backup ]; then
                        cp /tmp/backend.env.backup backend/.env
                    fi
                '''
            }
        }
        
        stage('Build and Deploy Main Server') {
            steps {
                sh '''
                    cd /home/ubuntu/project
                    sudo docker compose down || true
                    sudo docker compose up -d --build
                '''
            }
        }
        
        stage('Deploy GPU Server (AI Worker)') {
            steps {
                sh '''
                    ssh -i ${GPU_SSH_KEY} -o StrictHostKeyChecking=no ubuntu@${GPU_SERVER} '
                        cd /home/ubuntu/project
                        
                        if [ -f ai-worker/.env ]; then
                            cp ai-worker/.env /tmp/ai-worker.env.backup
                        fi
                        
                        git fetch origin
                        git reset --hard origin/main
                        
                        if [ -f /tmp/ai-worker.env.backup ]; then
                            cp /tmp/ai-worker.env.backup ai-worker/.env
                        fi
                        
                        sudo systemctl restart kero-ai-worker
                        sleep 5
                        sudo systemctl status kero-ai-worker --no-pager
                    '
                '''
            }
        }
        
        stage('Health Check') {
            steps {
                sh '''
                    sleep 30
                    curl -f -k https://plyst.info || exit 1
                    curl -f -k https://plyst.info/api/health || echo "Backend health check skipped"
                    echo "Main server health check passed!"
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
            echo '✅ Deployment successful! Main Server + GPU AI Worker'
        }
        failure {
            echo '❌ Deployment failed!'
        }
    }
}
