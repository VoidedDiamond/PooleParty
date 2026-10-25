// Sign.java - sign (APK Signature Scheme v2, all Android 7+ needs) and verify an APK with Google's apksig library.
// usage: java -cp apksig.jar Sign.java unsigned.apk signed.apk keystore.p12 password
import com.android.apksig.ApkSigner;
import com.android.apksig.ApkVerifier;

import java.io.File;
import java.io.FileInputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.Collections;

public class Sign {
    public static void main(String[] a) throws Exception {
        char[] pass = a[3].toCharArray();
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (FileInputStream in = new FileInputStream(a[2])) {
            ks.load(in, pass);
        }
        String alias = ks.aliases().nextElement();
        PrivateKey key = (PrivateKey) ks.getKey(alias, pass);
        X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

        ApkSigner.SignerConfig signer = new ApkSigner.SignerConfig.Builder("CERT", key, Collections.singletonList(cert)).build();
        new ApkSigner.Builder(Collections.singletonList(signer))
                .setInputApk(new File(a[0]))
                .setOutputApk(new File(a[1]))
                .setV1SigningEnabled(false)   // v1/JAR signing in apksig 2.3 needs JDK internals that no longer exist
                .setV2SigningEnabled(true)
                .build()
                .sign();

        ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[1])).build().verify();
        if (!r.isVerified()) {
            System.err.println("verification failed: " + r.getErrors());
            System.exit(1);
        }
        System.out.println("signed and verified (v2: " + r.isVerifiedUsingV2Scheme() + ")");
    }
}
