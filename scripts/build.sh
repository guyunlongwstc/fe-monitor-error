export PATH=$NODEJS_BIN_LATEST:$PATH

echo "node: $(node -v)"
echo "npm: v$(npm -v)"

npm install
mkdir output
NODE_ENV=production npm run build
