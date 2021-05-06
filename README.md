
# Install

## Create a Domain, and Azure DNS Zone

Required to expose a TLS ingress route with a certificate.
Take a note of the Azure DNS Zone property Id 

## Create Cluster

Create a AKS cluster

Use the AKS deploy cluster wizard here: https://khowling.github.io/aks-deploy-wizard/

Select the following options:
    * Operations: I prefer control & commuity opensource soltuions
    * Security: Simple cluster with no additional access limitations
    * Addon-Details tab, select
        * Run nginx on every node (deploy as Daemonset)
        * Create FQDN URLs for your applications using external-dns
        * Automatically Issue Certificates for HTTPS using cert-manager
        * Setup Azure Container Registry "Basic" tier & authorise aks to pull images

Now run the ```deploy``` and ```post deploy``` commands to create and configure your cluster

## Build Container

```
az acr build --registry $ACR_NAME --image http-eventhub:0.2 .
```

## Deploy

Create Eventhub namespace and hub, standard, with 32 patitions, and note down the connection details


Create aks secret

```
kubectl create secret generic http-eventhub-secret \
 --from-literal=AMQP_HOST=xxx.servicebus.windows.net \
 --from-literal=AMQP_USERNAME=RootManageSharedAccessKey \
 --from-literal=AMQP_PASSWORD=xxx \
 --from-literal=SENDER_ADDRESS=hub1
```

Deploy the app

```
kubectl apply -f ./deployment.yml
```

## View Grafana dashboards

Change Grafana Service type to ```LoadBalancer```

```
kubectl edit service monitoring-grafana -n monitoring
```

login with admin/prom-operator
```
http://<IP>
```

Install nodejs dashboard: https://grafana.com/grafana/dashboards/11159
Install nginx dashboard: https://grafana.com/grafana/dashboards/9614


# Future Optimisations

* re-write runtime in rust
* use envoy as ingress proxy
* ingress service backend only local pods (requires 1.21)
* internalTrafficPolicy: Local
* https://kubernetes.io/docs/concepts/services-networking/service-traffic-policy/
