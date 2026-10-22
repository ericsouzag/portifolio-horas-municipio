// =====================================================================
//  ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR PARA PERSONALIZAR O SITE
// =====================================================================

export const SITE = {
  teacherName: "Eric",                              // seu nome
  role: "Professor de Informática",                  // seu cargo
  adminEmail: "ericdesouzag@gmail.com",                 // o e-mail Google que pode entrar no painel (admin.html)

  // Escolas em que você trabalha. Cada uma tem a própria contagem de horas e a própria senha.
  // "id" é o código interno: depois de cadastrar trabalhos, não mude o id (só o nome, se precisar).
  // "login" é o e-mail da conta da escola criada no Firebase (SETUP.md, passo 9). A senha NÃO fica aqui:
  // ela é definida só no Firebase, para ninguém conseguir lê-la no código do site.
  schools: [
    { id: "felipe-de-freitas", name: "Escola Municipal Felipe de Freitas", short: "Felipe de Freitas", login: "felipe@portfolio-escola.firebaseapp.com" },
    { id: "epifanio-mourao", name: "Escola Municipal Coronel Epifânio Mendes Mourão", short: "Coronel Epifânio", login: "coronel@portfolio-escola.firebaseapp.com" },
  ],
};

// Cole aqui o firebaseConfig que o Firebase mostra ao registrar o app web (ver SETUP.md, passo 2).
// Enquanto estiver "COLE_AQUI", o site abre em modo demonstração, com os trabalhos de exemplo.
export const firebaseConfig = {
  apiKey: "AIzaSyAk8-J3O1k2uJddftnbVHlOiWDLLdu1oXY",
  authDomain: "portfolio-escola.firebaseapp.com",
  projectId: "portfolio-escola",
  storageBucket: "portfolio-escola.firebasestorage.app",
  messagingSenderId: "911723457867",
  appId: "1:911723457867:web:2fc18c1bd843d1749d4cce",
};
