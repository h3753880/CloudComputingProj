1. Github link: https://github.com/h3753880/CloudComputingProj (include our result and source files)


2. JMeter stress Testing build steps:
   1) Use ‘docker pull h3753880/final2’ to get the image which contains docker and LAMP test program.
   2) Start the docker image on cloud platform.
   3) Download Jmeter from http://jmeter.apache.org/download_jmeter.cgi (latest version), install in the local computer.
   4) In the TestPlan1.jmx, change <stringProp name="HTTPSampler.domain">104.210.46.51</stringProp> tag to you cloud platform url.
   5) execute command: jmeter -n -t TestPlan1.jmx -l result1.jtl -e -o ~/result1 in the local computer.
   6) for each container installed on cloud, repeat step 4)~5)
   7) HTML dashboard will be in the folder ~/result1



3. Video conversion Testing Steps:

Step1:
install Docker

$sudo apt-get update
$curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
$sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    software-properties-common
$sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
$sudo apt-get update
$sudo apt-get install docker-ce

Step2:
install dockprom which is a monitoring solution for Docker hosts and containers with grafana, cadvisor and Prometheus.

$sudo su
$curl -L https://github.com/docker/compose/releases/download/1.11.2/docker-compose-`uname -s`-`uname -m` > /usr/local/bin/docker-compose
$chmod +x /usr/local/bin/docker-compose
$git clone https://github.com/stefanprodan/dockprom
$cd dockprom
$sudo service docker start
$sudo ADMIN_USER=admin ADMIN_PASSWORD=admin docker-compose up -d
$sudo usermod -a -G docker ubuntu  //change mode

Step3:
pull the testing image from our github

$sudo docker pull h3753880/empty6

Step4:
run testing image

$sudo docker run -it h3753880/empty6

Step5:
open the Grafana GUI on Broswer IP is serverIP:3000 and username and passward are admin.
to supervise the resourse usage.

Step6:
run testing file on the terminal

#sh test.sh

Step7:
get the execution time.

#cat statime.txt endtime.txt



4. Here's sysbench Testing Steps.

We repeat these steps three times for each machine, then get more precise data.
 
Step1:
install Docker

$sudo apt-get update
$curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
$sudo apt-get install \
    apt-transport-https \
    ca-certificates \
    curl \
    software-properties-common
$sudo add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
$sudo apt-get update
$sudo apt-get install docker-ce

Step2:
pull the testing image from our docker hub, since we already installed the command that we need.

$sudo docker pull h3753880/empty6

Step3:
run testing image

$sudo docker run -it h3753880/empty6

Step4:
run cpu performance command and get execution time.

#sysbench --test=cpu --cpu-max-prime=20000 run

Step5:
run File I/O performance command and get the File I/O performance.

#sysbench --test=fileio --file-total-size=1G prepare
#sysbench --test=fileio --file-total-size=1G --file-test-mode=rndrw --init-rng=on --max-time=180 --max-requests=0 run

Step6:
clean test files

#sysbench --test=fileio --file-total-size=1G clean



5. GrafanaDeshboardDeploy.json:

This json file is our configuration of the grafana deshboard.