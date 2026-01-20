pipeline {
    agent any
    
    environment {
        PROJECT_DIR = '/home/ubuntu/project'
    }
    
    stages {
        stage('Pull Latest Code') {
            steps {
                sh '''
                    git config --global --add safe.directory /home/ubuntu/project
                    cd /home/ubuntu/project
                    git fetch origin
                    git reset --hard origin/main
                '''
            }
        }
        
        stage('Build & Deploy') {
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
                    sleep 15
                    curl -f -k https://plyst.info || exit 1
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
            echo '✅ Deployment completed successfully!'
        }
        failure {
            echo '❌ Deployment failed!'
        }
    }
}
