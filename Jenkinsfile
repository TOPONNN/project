pipeline {
    agent any
    
    environment {
        PROJECT_DIR = '/home/ubuntu/project'
        GITHUB_REPO = 'https://github.com/TOPONNN/project.git'
    }
    
    stages {
        stage('Pull Latest Code') {
            steps {
                script {
                    sh """
                        cd ${PROJECT_DIR}
                        git fetch origin
                        git reset --hard origin/main
                    """
                }
            }
        }
        
        stage('Build & Deploy') {
            steps {
                script {
                    sh """
                        cd ${PROJECT_DIR}
                        docker compose down || true
                        docker compose up -d --build
                    """
                }
            }
        }
        
        stage('Health Check') {
            steps {
                script {
                    sh """
                        sleep 10
                        curl -f https://plyst.info || exit 1
                        echo "Deployment successful!"
                    """
                }
            }
        }
        
        stage('Cleanup') {
            steps {
                script {
                    sh """
                        docker image prune -f
                    """
                }
            }
        }
    }
    
    post {
        success {
            echo 'Deployment completed successfully!'
        }
        failure {
            echo 'Deployment failed!'
        }
    }
}
